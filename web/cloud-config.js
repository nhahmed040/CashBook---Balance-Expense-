/* Connection to the shared Firebase project. These two values are identifiers, not passwords:
   the database rules decide who can read or write what. Change them here (or under
   Settings → Online backup → Advanced) to use a different Firebase project. */
window.CB_CLOUD_DEFAULTS = {
  dbUrl: 'https://cashbook-1cebb-default-rtdb.firebaseio.com',
  apiKey: 'AIzaSyCoaw_sMJraqsDGxoDmO5dLeJRsMCN99D8',
  // Web client ID of the Google provider (Firebase → Authentication → Sign-in method → Google). Used by the Android app only.
  googleClientId: '230003433667-c7o68go2f96onii0quo4g4qhibeqkc5u.apps.googleusercontent.com'
};
