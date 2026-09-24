package fi.porssisahko.laskuri;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

public class PriceWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        requestImmediateUpdate(context);
    }

    @Override
    public void onEnabled(Context context) {
        PriceUpdateScheduler.schedulePeriodic(context);
        requestImmediateUpdate(context);
    }

    static void requestImmediateUpdate(Context context) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(PriceUpdateWorker.class).build();
        WorkManager.getInstance(context).enqueueUniqueWork(
                "price_update_immediate",
                ExistingWorkPolicy.REPLACE,
                request
        );
    }
}
