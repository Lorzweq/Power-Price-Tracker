package fi.porssisahko.laskuri;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

class NotificationHelper {

    static final String CHANNEL_ID = "electricity_price";
    static final int NOTIFICATION_ID = 1001;

    static void updateNotification(Context context, String priceText, String updatedAtText, Bitmap chart) {
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        if (!manager.areNotificationsEnabled()) {
            return;
        }
        createChannelIfNeeded(context);

        Intent openApp = new Intent(context, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context, 0, openApp,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("Sähkön hinta nyt: " + priceText)
                .setContentText("Päivitetty " + updatedAtText)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(pendingIntent)
                .setCategory(NotificationCompat.CATEGORY_STATUS);

        // Graafi näkyy laajennetussa näkymässä; kutistettuna riittää pelkkä hintateksti.
        if (chart != null) {
            builder.setStyle(new NotificationCompat.BigPictureStyle()
                    .bigPicture(chart)
                    .setBigContentTitle("Sähkön hinta nyt: " + priceText)
                    .setSummaryText("Päivitetty " + updatedAtText));
        }

        manager.notify(NOTIFICATION_ID, builder.build());
    }

    private static void createChannelIfNeeded(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            NotificationChannel channel = manager.getNotificationChannel(CHANNEL_ID);
            if (channel == null) {
                channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Sähkön hinta",
                        NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Näyttää nykyisen pörssisähkön hinnan jatkuvasti ilmoituksena");
                channel.setShowBadge(false);
                manager.createNotificationChannel(channel);
            }
        }
    }
}
