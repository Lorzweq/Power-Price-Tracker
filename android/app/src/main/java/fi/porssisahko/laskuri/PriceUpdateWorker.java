package fi.porssisahko.laskuri;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.widget.RemoteViews;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

public class PriceUpdateWorker extends Worker {

    private static final String LATEST_PRICES_URL =
            "https://porssisahko-proxy.leevi-hanninen3.workers.dev?latest=true";

    /** Graafiin otettava aikaikkuna nykyhetken ympäriltä. */
    private static final long CHART_PAST_MILLIS = 3L * 60 * 60 * 1000;
    private static final long CHART_FUTURE_MILLIS = 21L * 60 * 60 * 1000;

    public PriceUpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        long now = System.currentTimeMillis();
        String updatedAtText = new SimpleDateFormat("HH:mm", new Locale("fi", "FI")).format(new Date(now));

        List<PricePoint> points;
        try {
            points = fetchPrices();
        } catch (Exception e) {
            points = null;
        }

        Double price = findCurrentPrice(points, now);
        String priceText = price != null
                ? String.format(new Locale("fi", "FI"), "%.2f snt/kWh", price)
                : "Ei saatavilla";

        Bitmap chart = PriceChartRenderer.render(chartWindow(points, now), now);

        updateWidgets(context, priceText, updatedAtText);
        NotificationHelper.updateNotification(context, priceText, updatedAtText, chart);

        return price != null ? Result.success() : Result.retry();
    }

    private Double findCurrentPrice(List<PricePoint> points, long now) {
        if (points == null) return null;
        for (PricePoint p : points) {
            if (p.startMillis <= now && now < p.endMillis) {
                return p.price;
            }
        }
        return null;
    }

    /** Rajaa hintasarjan graafissa näytettävään aikaikkunaan. */
    private List<PricePoint> chartWindow(List<PricePoint> points, long now) {
        if (points == null) return null;
        List<PricePoint> window = new ArrayList<>();
        for (PricePoint p : points) {
            if (p.startMillis >= now - CHART_PAST_MILLIS && p.startMillis <= now + CHART_FUTURE_MILLIS) {
                window.add(p);
            }
        }
        return window;
    }

    private void updateWidgets(Context context, String priceText, String updatedAtText) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, PriceWidgetProvider.class);
        int[] widgetIds = manager.getAppWidgetIds(component);
        if (widgetIds.length == 0) return;

        Intent openApp = new Intent(context, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context, 0, openApp,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        for (int widgetId : widgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.price_widget);
            views.setTextViewText(R.id.widget_price, priceText);
            views.setTextViewText(R.id.widget_updated, "Päivitetty " + updatedAtText);
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
            manager.updateAppWidget(widgetId, views);
        }
    }

    /** Hakee hintasarjan ja palauttaa sen aikajärjestyksessä. */
    private List<PricePoint> fetchPrices() throws Exception {
        URL url = new URL(LATEST_PRICES_URL);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);

        try {
            int status = connection.getResponseCode();
            if (status != 200) return null;

            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
            }

            JSONArray prices = extractPricesArray(sb.toString());
            if (prices == null) return null;

            List<PricePoint> points = new ArrayList<>();
            for (int i = 0; i < prices.length(); i++) {
                JSONObject entry = prices.getJSONObject(i);
                long start = parseIsoDate(entry.optString("startDate", null));
                long end = parseIsoDate(entry.optString("endDate", null));
                Double price = readPrice(entry);
                if (start >= 0 && end >= 0 && price != null) {
                    points.add(new PricePoint(start, end, price));
                }
            }

            // Rajapinta palauttaa uusimman ensin; graafi tarvitsee nousevan aikajärjestyksen.
            Collections.sort(points, (a, b) -> Long.compare(a.startMillis, b.startMillis));
            return points;
        } finally {
            connection.disconnect();
        }
    }

    private JSONArray extractPricesArray(String body) throws Exception {
        Object parsed = new JSONTokener(body).nextValue();
        if (parsed instanceof JSONArray) {
            return (JSONArray) parsed;
        }
        if (parsed instanceof JSONObject) {
            JSONObject obj = (JSONObject) parsed;
            if (obj.has("prices")) {
                return obj.getJSONArray("prices");
            }
        }
        return null;
    }

    private Double readPrice(JSONObject entry) {
        Object raw = entry.opt("price");
        if (raw instanceof Number) {
            return ((Number) raw).doubleValue();
        }
        if (raw instanceof String) {
            try {
                return Double.parseDouble(((String) raw).replace(',', '.'));
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    private long parseIsoDate(String iso) {
        if (iso == null) return -1;
        String[] patterns = {
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                "yyyy-MM-dd'T'HH:mm:ss'Z'"
        };
        for (String pattern : patterns) {
            try {
                SimpleDateFormat sdf = new SimpleDateFormat(pattern, Locale.US);
                sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date parsed = sdf.parse(iso);
                if (parsed != null) return parsed.getTime();
            } catch (Exception ignored) {
            }
        }
        return -1;
    }
}
