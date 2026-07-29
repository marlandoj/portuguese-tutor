(() => {
  const allowed = ["living-places", "artisan-study", "travel-diary"];
  let theme = "living-places";
  try {
    const stored = window.localStorage.getItem("portugues-tutor-theme");
    if (allowed.includes(stored)) theme = stored;
  } catch {
    theme = "living-places";
  }
  document.documentElement.dataset.tutorTheme = theme;
})();
