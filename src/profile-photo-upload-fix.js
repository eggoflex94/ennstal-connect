// Legacy compatibility module intentionally left inactive.
//
// Profile gallery uploads are owned by the React ProfilePhotoGallery component
// in App.jsx on every device. A previous document-level capture handler stopped
// the React change event and created a second, competing upload implementation.
// Keeping this module as a no-op avoids breaking old imports while guaranteeing
// that desktop and mobile use the exact same upload path.
