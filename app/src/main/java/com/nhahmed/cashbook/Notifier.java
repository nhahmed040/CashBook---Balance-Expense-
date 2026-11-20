package com.nhahmed.cashbook;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Phone notifications for CashBook reminders. The web app works out what to remind about and
 * hands over a list of {id, at, title, text}; this class schedules one alarm for each entry.
 * The list is kept so the alarms can be set again after a reboot or an app update.
 */
final class Notifier {
    private static final String CHANNEL = "reminders";
    private static final String PREFS = "notif";
    private static final String KEY_EVENTS = "events";
    private static final String KEY_IDS = "ids";
    private static final int MAX_EVENTS = 64;

    private Notifier() { }

    static void apply(Context c, String json) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_EVENTS, json).apply();
        schedule(c, json);
    }

    static void reschedule(Context c) {
        schedule(c, c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_EVENTS, "[]"));
    }

    private static PendingIntent alarmIntent(Context c, int id, String title, String text, int flags) {
        Intent in = new Intent(c, ReminderReceiver.class);
        in.putExtra("id", id);
        in.putExtra("title", title);
        in.putExtra("text", text);
        return PendingIntent.getBroadcast(c, id, in, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void schedule(Context c, String json) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (am == null) return;
        // cancel what was scheduled before
        String old = sp.getString(KEY_IDS, "");
        if (!old.isEmpty()) {
            for (String s : old.split(",")) {
                try {
                    PendingIntent pi = alarmIntent(c, Integer.parseInt(s), "", "", PendingIntent.FLAG_NO_CREATE);
                    if (pi != null) { am.cancel(pi); pi.cancel(); }
                } catch (Exception ignored) { /* keep going */ }
            }
        }
        StringBuilder ids = new StringBuilder();
        try {
            JSONArray a = new JSONArray(json);
            long now = System.currentTimeMillis();
            int n = 0;
            for (int i = 0; i < a.length() && n < MAX_EVENTS; i++) {
                JSONObject o = a.getJSONObject(i);
                long at = o.getLong("at");
                int id = o.getInt("id");
                if (at <= now || id <= 0 || id >= 9000) continue;
                PendingIntent pi = alarmIntent(c, id, o.optString("title"), o.optString("text"), PendingIntent.FLAG_UPDATE_CURRENT);
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                if (ids.length() > 0) ids.append(',');
                ids.append(id);
                n++;
            }
        } catch (Exception ignored) { /* bad data: nothing scheduled */ }
        sp.edit().putString(KEY_IDS, ids.toString()).apply();
    }

    static void show(Context c, int id, String title, String text) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_DEFAULT));
        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(pi)
                .setAutoCancel(true);
        nm.notify(id, b.build());
    }
}
