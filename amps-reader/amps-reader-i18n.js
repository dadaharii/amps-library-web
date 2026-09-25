/* AMPS Reader — English / Hindi UI */
(function () {
  "use strict";

  const STR = {
    en: {
      library: "Library", paths: "Paths", discourses: "Discourses", notebook: "Notebook", more: "More",
      continueReading: "Continue reading", favorites: "Favorites", recentlyOpened: "Recently opened",
      recentlyAdded: "Recently added",
      passageOfDay: "Passage of the day", readNow: "Read now", search: "Search", study: "Study",
      settings: "Settings", journal: "Reflection Journal", stats: "Reading stats",
      importBook: "Import EPUB/PDF", collections: "Teacher collections", sync: "Cloud backup",
      startReading: "Start reading", discourseMode: "Discourse mode", summarize: "Summarize",
      memorization: "Memorize / Study", glossary: "Glossary", commentary: "Commentary",
      footnotes: "Footnotes", editorial: "Editorial notes", minutesLeft: "min left",
      todayGoal: "Daily goal", streak: "day streak", booksRead: "chapters opened",
      syncExport: "Export backup", syncImport: "Import backup", autoSync: "Auto-backup on close",
      lang: "Language", hindi: "हिन्दी", english: "English",
      presentExit: "Exit", presentNext: "Next paragraph", importSuccess: "Book imported",
      summaryChapter: "Summary", bookSummary: "Book summary", paragraphCount: "paragraphs",
      translating: "Translating…", close: "Close",
    },
    hi: {
      library: "पुस्तकालय", paths: "मार्ग", discourses: "प्रवचन", notebook: "नोटबुक", more: "अधिक",
      continueReading: "पढ़ना जारी रखें", favorites: "प्रिय", recentlyOpened: "हाल में खोले गए",
      recentlyAdded: "हाल में जोड़ी गईं",
      passageOfDay: "आज का प्रवचन", readNow: "अभी पढ़ें", search: "खोज", study: "अध्ययन",
      settings: "सेटिंग", journal: "चिंतन पत्रिका", stats: "पठन सांख्यिकी",
      importBook: "EPUB/PDF आयात", collections: "शिक्षक संग्रह", sync: "बैकअप",
      startReading: "पढ़ना शुरू करें", discourseMode: "प्रवचन मोड", summarize: "सारांश",
      memorization: "स्मरण / अध्ययन", glossary: "शब्दकोश", commentary: "टीका",
      footnotes: "फ़ुटनोट", editorial: "संपादकीय नोट", minutesLeft: "मिनट शेष",
      todayGoal: "दैनिक लक्ष्य", streak: "दिन की लकीर", booksRead: "अध्याय खोले",
      syncExport: "बैकअप निर्यात", syncImport: "बैकअप आयात", autoSync: "बंद पर स्वयं बैकअप",
      lang: "भाषा", hindi: "हिन्दी", english: "English",
      presentExit: "बाहर", presentNext: "अगला अनुच्छेद", importSuccess: "पुस्तक आयात हुई",
      summaryChapter: "सारांश", bookSummary: "पुस्तक सारांश", paragraphCount: "अनुच्छेद",
      translating: "अनुवाद हो रहा है…", close: "बंद करें",
    },
  };

  function t(key, lang) {
    const l = lang || window.AmpsI18n?.lang || "en";
    return STR[l]?.[key] || STR.en[key] || key;
  }

  window.AmpsI18n = {
    STR,
    lang: "en",
    t,
    setLang(l) {
      this.lang = l === "hi" ? "hi" : "en";
      document.documentElement.lang = this.lang;
    },
  };
})();
