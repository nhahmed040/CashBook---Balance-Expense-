package com.nhahmed.cashbook;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Sets the reminder alarms again after the phone restarts or the app is updated. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            Notifier.reschedule(context);
        } catch (Exception ignored) { /* nothing to do */ }
    }
}
