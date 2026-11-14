(() => {
  const key = "some-clouds-language";
  const buttons = document.querySelectorAll("[data-language-button]");
  const content = document.querySelectorAll("[data-language]");
  const images = document.querySelectorAll("[data-alt-ja][data-alt-en]");

  function setLanguage(language) {
    document.documentElement.lang = language;
    content.forEach(element => {
      element.hidden = element.dataset.language !== language;
    });
    images.forEach(image => {
      image.alt = language === "en" ? image.dataset.altEn : image.dataset.altJa;
    });
    buttons.forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.languageButton === language));
    });
    try {
      localStorage.setItem(key, language);
    } catch {}
  }

  let language = "ja";
  try {
    if (localStorage.getItem(key) === "en") language = "en";
  } catch {}
  buttons.forEach(button => {
    button.addEventListener("click", () => setLanguage(button.dataset.languageButton));
  });
  setLanguage(language);
})();
