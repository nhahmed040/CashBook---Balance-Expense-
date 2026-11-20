package com.nhahmed.cashbook;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Fires when a scheduled reminder is due and shows the notification. */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String title = intent.getStringExtra("title");
        String text = intent.getStringExtra("text");
        if (title == null || title.isEmpty()) return;
        Notifier.show(context, intent.getIntExtra("id", 1), title, text == null ? "" : text);
    }
}
