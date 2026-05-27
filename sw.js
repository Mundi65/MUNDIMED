
const CACHE = 'mundimed-v1';

// Install service worker
self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(self.clients.claim());
});

// Listen for alarm schedule messages from the main app
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SCHEDULE_ALARMS') {
    var alarms = e.data.alarms;
    scheduleAlarmChecks(alarms);
  }
  if (e.data && e.data.type === 'CANCEL_ALARMS') {
    cancelAllAlarms();
  }
});

// Store alarm timers
var alarmTimers = [];

function cancelAllAlarms() {
  alarmTimers.forEach(function(t) { clearTimeout(t); });
  alarmTimers = [];
}

function scheduleAlarmChecks(alarms) {
  cancelAllAlarms();
  var now = new Date();
  
  alarms.forEach(function(alarm) {
    var parts = alarm.time.split(':');
    var alarmTime = new Date();
    alarmTime.setHours(parseInt(parts[0]), parseInt(parts[1]), 0, 0);
    
    // If alarm time already passed today, skip
    var diff = alarmTime.getTime() - now.getTime();
    if (diff < 0) return;
    
    // Schedule the notification
    var t = setTimeout(function() {
      if (!alarm.taken) {
        self.registration.showNotification('💊 MUNDIMED — Medicamento', {
          body: 'Tomar: ' + alarm.medName + ' ' + alarm.dose + ' ' + alarm.unit,
          icon: '/icon.png',
          badge: '/icon.png',
          tag: 'med-' + alarm.medId + '-' + alarm.time,
          renotify: true,
          requireInteraction: true,
          vibrate: [300, 100, 300, 100, 300, 100, 600],
          actions: [
            { action: 'confirm', title: '✅ Ya tomé' },
            { action: 'snooze', title: '⏱ 5 min' }
          ],
          data: { medId: alarm.medId, time: alarm.time, date: alarm.date }
        });
      }
    }, diff);
    
    alarmTimers.push(t);
  });
}

// Handle notification clicks
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  
  var action = e.action;
  var data = e.notification.data || {};
  
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
      // Send message to app
      var msg = {
        type: action === 'confirm' ? 'CONFIRM_DOSE' : 'SNOOZE_DOSE',
        medId: data.medId,
        time: data.time,
        date: data.date
      };
      
      if (clients.length > 0) {
        clients[0].postMessage(msg);
        clients[0].focus();
      } else {
        // Open the app
        self.clients.openWindow('/').then(function(client) {
          if (client) {
            setTimeout(function() { client.postMessage(msg); }, 1000);
          }
        });
      }
    })
  );
});

// Handle notification dismiss
self.addEventListener('notificationclose', function(e) {
  // Snooze automatically if dismissed without action
  var data = e.notification.data || {};
  if (data.medId) {
    setTimeout(function() {
      self.registration.showNotification('💊 MUNDIMED — Medicamento (pendiente)', {
        body: 'Aún tienes un medicamento pendiente de confirmar',
        tag: 'med-reminder-' + data.medId,
        requireInteraction: true,
        vibrate: [200, 100, 200],
        data: data,
        actions: [
          { action: 'confirm', title: '✅ Ya tomé' },
          { action: 'snooze', title: '⏱ 5 min' }
        ]
      });
    }, 5 * 60 * 1000);
  }
});
