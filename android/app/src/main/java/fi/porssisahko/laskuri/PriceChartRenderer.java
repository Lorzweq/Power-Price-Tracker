package fi.porssisahko.laskuri;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Shader;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Piirtää hintakäyrän viivagraafina ilmoitusta varten. */
class PriceChartRenderer {

    private static final int WIDTH = 600;
    private static final int HEIGHT = 260;

    private static final float PAD_LEFT = 16f;
    private static final float PAD_RIGHT = 16f;
    private static final float PAD_TOP = 34f;
    private static final float PAD_BOTTOM = 32f;

    private static final int COLOR_BG = Color.parseColor("#1e293b");
    private static final int COLOR_LINE = Color.parseColor("#fbbf24");
    private static final int COLOR_FILL_TOP = Color.parseColor("#59fbbf24");
    private static final int COLOR_FILL_BOTTOM = Color.parseColor("#00fbbf24");
    private static final int COLOR_TEXT = Color.parseColor("#94a3b8");
    private static final int COLOR_NOW = Color.parseColor("#f8fafc");
    private static final int COLOR_GRID = Color.parseColor("#33475569");

    /**
     * @param points aikajärjestyksessä olevat hintapisteet
     * @param now    nykyhetki millisekunteina
     * @return graafi bittikarttana, tai null jos dataa on liian vähän
     */
    static Bitmap render(List<PricePoint> points, long now) {
        if (points == null || points.size() < 2) return null;

        long tMin = points.get(0).startMillis;
        long tMax = points.get(points.size() - 1).startMillis;
        if (tMax <= tMin) return null;

        double pMin = Double.MAX_VALUE;
        double pMax = -Double.MAX_VALUE;
        for (PricePoint p : points) {
            if (p.price < pMin) pMin = p.price;
            if (p.price > pMax) pMax = p.price;
        }
        // Tasainen hintakäyrä tarvitsee keinotekoisen vaihteluvälin, jottei viiva litisty reunaan.
        if (pMax - pMin < 0.5) {
            double mid = (pMax + pMin) / 2.0;
            pMin = mid - 0.25;
            pMax = mid + 0.25;
        }

        Bitmap bitmap = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(COLOR_BG);

        float left = PAD_LEFT;
        float right = WIDTH - PAD_RIGHT;
        float top = PAD_TOP;
        float bottom = HEIGHT - PAD_BOTTOM;

        drawGrid(canvas, left, right, top, bottom);
        drawSeries(canvas, points, tMin, tMax, pMin, pMax, left, right, top, bottom);
        drawNowMarker(canvas, points, now, tMin, tMax, pMin, pMax, left, right, top, bottom);
        drawLabels(canvas, points, pMin, pMax, tMin, tMax, left, right, top, bottom);

        return bitmap;
    }

    private static void drawGrid(Canvas canvas, float left, float right, float top, float bottom) {
        Paint grid = new Paint(Paint.ANTI_ALIAS_FLAG);
        grid.setColor(COLOR_GRID);
        grid.setStrokeWidth(1f);
        for (int i = 0; i <= 3; i++) {
            float y = top + (bottom - top) * i / 3f;
            canvas.drawLine(left, y, right, y, grid);
        }
    }

    private static void drawSeries(Canvas canvas, List<PricePoint> points,
                                   long tMin, long tMax, double pMin, double pMax,
                                   float left, float right, float top, float bottom) {
        Path line = new Path();
        Path fill = new Path();

        for (int i = 0; i < points.size(); i++) {
            PricePoint p = points.get(i);
            float x = xFor(p.startMillis, tMin, tMax, left, right);
            float y = yFor(p.price, pMin, pMax, top, bottom);
            if (i == 0) {
                line.moveTo(x, y);
                fill.moveTo(x, bottom);
                fill.lineTo(x, y);
            } else {
                line.lineTo(x, y);
                fill.lineTo(x, y);
            }
        }
        fill.lineTo(right, bottom);
        fill.close();

        Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        fillPaint.setShader(new LinearGradient(
                0, top, 0, bottom, COLOR_FILL_TOP, COLOR_FILL_BOTTOM, Shader.TileMode.CLAMP));
        canvas.drawPath(fill, fillPaint);

        Paint linePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        linePaint.setColor(COLOR_LINE);
        linePaint.setStyle(Paint.Style.STROKE);
        linePaint.setStrokeWidth(3.5f);
        linePaint.setStrokeJoin(Paint.Join.ROUND);
        linePaint.setStrokeCap(Paint.Cap.ROUND);
        canvas.drawPath(line, linePaint);
    }

    private static void drawNowMarker(Canvas canvas, List<PricePoint> points, long now,
                                      long tMin, long tMax, double pMin, double pMax,
                                      float left, float right, float top, float bottom) {
        if (now < tMin || now > tMax) return;

        float x = xFor(now, tMin, tMax, left, right);

        Paint marker = new Paint(Paint.ANTI_ALIAS_FLAG);
        marker.setColor(COLOR_NOW);
        marker.setStrokeWidth(1.5f);
        marker.setAlpha(120);
        canvas.drawLine(x, top, x, bottom, marker);

        PricePoint current = null;
        for (PricePoint p : points) {
            if (p.startMillis <= now && now < p.endMillis) {
                current = p;
                break;
            }
        }
        if (current == null) return;

        float y = yFor(current.price, pMin, pMax, top, bottom);
        marker.setAlpha(255);
        marker.setStyle(Paint.Style.FILL);
        canvas.drawCircle(x, y, 6.5f, marker);
        Paint inner = new Paint(Paint.ANTI_ALIAS_FLAG);
        inner.setColor(COLOR_LINE);
        canvas.drawCircle(x, y, 3.5f, inner);
    }

    private static void drawLabels(Canvas canvas, List<PricePoint> points,
                                   double pMin, double pMax, long tMin, long tMax,
                                   float left, float right, float top, float bottom) {
        Locale fi = new Locale("fi", "FI");

        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setColor(COLOR_TEXT);
        text.setTextSize(19f);

        canvas.drawText(
                String.format(fi, "%.2f–%.2f snt/kWh", pMin, pMax),
                left, top - 12f, text);

        SimpleDateFormat hourFormat = new SimpleDateFormat("HH", fi);
        text.setTextSize(17f);
        for (int i = 0; i <= 4; i++) {
            long t = tMin + (tMax - tMin) * i / 4;
            float x = xFor(t, tMin, tMax, left, right);
            String label = hourFormat.format(new Date(t));
            float width = text.measureText(label);
            float tx = Math.min(Math.max(x - width / 2f, left), right - width);
            canvas.drawText(label, tx, bottom + 22f, text);
        }
    }

    private static float xFor(long t, long tMin, long tMax, float left, float right) {
        double ratio = (double) (t - tMin) / (double) (tMax - tMin);
        return (float) (left + ratio * (right - left));
    }

    private static float yFor(double price, double pMin, double pMax, float top, float bottom) {
        double ratio = (price - pMin) / (pMax - pMin);
        return (float) (bottom - ratio * (bottom - top));
    }
}
