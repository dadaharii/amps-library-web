/* AMPS Reader — TTS with paragraph highlight sync + native Android fallback */
(function () {
  "use strict";

  const PREVIEW_TEXT = "Svadharme nidhanam shreyah — perform your own duty with sincerity.";
  const HI_PREVIEW_TEXT = "अपने स्वधर्म का पालन करना सबसे उत्तम है।";
  const AMPS_PREVIEW_TEXT = "Saḿskrta, Parama Puruśa, Ánanda, Sádhaná, Dharma, Krśńa.";

  const PRESETS = [
    { value: "in-en-female", label: "Indian Female" },
    { value: "in-en-male", label: "Indian Male" },
    { value: "en-female", label: "English (female)" },
    { value: "en-male", label: "English (male)" },
    { value: "hi-female", label: "Hindi (female)" },
    { value: "hi-male", label: "Hindi (male)" },
    { value: "hi", label: "Hindi (female)" },
    { value: "default", label: "System default" },
  ];

  function normalizePreset(preset) {
    if (preset === "female") return "in-en-female";
    if (preset === "male") return "in-en-male";
    if (preset === "hi") return "hi-female";
    return preset || "in-en-female";
  }

  function isHindiPreset(preset) {
    const p = normalizePreset(preset);
    if (p === "hi-female" || p === "hi-male") return true;
    if (p.startsWith("voice:")) return /(^|:)hi[-_]/i.test(p) || /hindi|hi-in|hi_in/i.test(p);
    return false;
  }

  function genderFromPreset(preset) {
    const p = normalizePreset(preset);
    if (p === "in-en-male" || p === "en-male" || p === "hi-male") return "male";
    if (p === "in-en-female" || p === "en-female" || p === "hi-female") return "female";
    if (p.startsWith("voice:")) {
      const uri = p.slice(6).toLowerCase();
      if (/male|rishi|hid|daniel|david|james|arjun|rahul/.test(uri)) return "male";
    }
    return "female";
  }

  function hasDevanagari(text) {
    return /[\u0900-\u097F]/.test(String(text || ""));
  }

  // Corpus language of the paragraphs currently being read ("en" or "hi-Deva").
  let sessionCorpusLanguage = "en";

  function isHindiCorpus(lang) {
    const s = String(lang || "").toLowerCase();
    return s === "hi" || s.startsWith("hi-");
  }

  function hindiVoicePreset(preset) {
    const p = normalizePreset(preset);
    if (isHindiPreset(p)) return p;
    return genderFromPreset(p) === "male" ? "hi-male" : "hi-female";
  }

  function normalizePronunciationMode(mode) {
    const m = String(mode || "").trim().toLowerCase();
    if (m === "off" || m === "normal") return "off";
    if (m === "basic") return "basic";
    if (m === "amps-enhanced" || m === "amps-hi-samskrta" || m === "amps") return "amps-enhanced";
    return "amps-enhanced";
  }

  function resolveSanskritSpeechMode(options) {
    if (options?.sanskritMode) return normalizePronunciationMode(options.sanskritMode);
    return normalizePronunciationMode(options?.pronunciationMode);
  }

  /**
   * Voice for Samskrta phonetic playback.
   * Prefer Indian English / English locales — never treat Hindi as the default
   * Samskrta or English pronunciation engine.
   */
  function pickVoiceForSanskrit(voices, preset) {
    if (!voices?.length) return null;
    const gender = genderFromPreset(preset);
    const pools = [
      voices.filter(isEnIn),
      voices.filter(v => isEn(v) && /^en[-_]GB/i.test(v.lang)),
      voices.filter(v => isEn(v) && /^en[-_]US/i.test(v.lang)),
      voices.filter(isEn),
      voices,
    ];
    for (const pool of pools) {
      const picked = pickByGender(pool, gender);
      if (picked) return picked;
    }
    return voices[0] || null;
  }

  /** English-only voice pools (en-IN → en-GB → en-US). Never Hindi. */
  function pickVoiceForEnglish(voices, preset) {
    if (!voices?.length) return null;
    const gender = genderFromPreset(preset);
    const pools = [
      voices.filter(isEnIn),
      voices.filter(v => isEn(v) && /^en[-_]GB/i.test(v.lang)),
      voices.filter(v => isEn(v) && /^en[-_]US/i.test(v.lang)),
      voices.filter(isEn),
    ];
    for (const pool of pools) {
      const picked = pickByGender(pool, gender);
      if (picked) return picked;
    }
    return null;
  }

  const ROMAN_SAMSKRTA_LETTER_CLASS = "A-Za-zÁĀÍĪÚŪáāíīúūḿṁṃńṇṅṋñśṣṭḍṛḷṝŕ";

  function normalizeReadingStyle(style) {
    const s = String(style || "human").toLowerCase();
    if (s === "pravachan") return "pravachan";
    if (s === "human" || s === "discourse") return "human";
    return "normal";
  }

  const PRAVACHAN_VOICE_PRESET = "in-en-male";

  function effectiveVoicePreset(preset, readingStyle) {
    const p = normalizePreset(preset);
    const style = normalizeReadingStyle(readingStyle);
    if (style === "human") {
      if (p === "hi-female" || p === "in-en-female" || p === "en-female" || p === "female") return "in-en-female";
      if (p === "hi-male" || p === "in-en-male" || p === "en-male" || p === "male") return "in-en-male";
      return p === "hi" || p === "hi-female" ? "in-en-female" : PRAVACHAN_VOICE_PRESET;
    }
    if (style !== "pravachan") return p;
    if (p === "hi-female" || p === "hi" || p === "in-en-female" || p === "en-female" || p === "female") return "in-en-female";
    if (p === "in-en-male" || p === "en-male" || p === "hi-male" || p === "male") return "in-en-male";
    if (p.startsWith("voice:")) {
      const uri = p.slice(6).toLowerCase();
      if (/hindi|hi-in|hi_in|kajal|hia|leda|aditi/.test(uri)) return /male|hid|heera/.test(uri) ? "in-en-male" : "in-en-female";
      return p;
    }
    return PRAVACHAN_VOICE_PRESET;
  }

  const AMPS_WORDS = new Map(Object.entries({
    "a'nanda": "आनन्द",
    "ananda": "आनन्द",
    "ánanda": "आनन्द",
    "ánanda": "आनन्द",
    "anandamurti": "आनन्दमूर्ति",
    "anandamurtiji": "आनन्दमूर्ति",
    "anandamurtijii": "आनन्दमूर्ति",
    "ánandamúrti": "आनन्दमूर्ति",
    "ánandamúrtiji": "आनन्दमूर्ति",
    "ánandamúrtijii": "आनन्दमूर्ति",
    "shrii shrii anandamurti": "श्री श्री आनन्दमूर्ति",
    "shrii shrii ánandamúrti": "श्री श्री आनन्दमूर्ति",
    "shrii": "श्री",
    "shri": "श्री",
    "shrii shrii": "श्री श्री",
    "samskrta": "संस्कृत",
    "saḿskrta": "संस्कृत",
    "saḿskrta": "संस्कृत",
    "saḿskrtaṃ": "संस्कृतम्",
    "oṋḿ": "ओंम्",
    "saḿskáras": "संस्कारास",
    "samskáras": "संस्कारास",
    "sanskrit": "संस्कृत",
    "sanskrita": "संस्कृत",
    "dharma": "धर्म",
    "svadharma": "स्वधर्म",
    "sadhana": "साधना",
    "sadhaná": "साधना",
    "sádhaná": "साधना",
    "sádhaná": "साधना",
    "Sádhaná": "साधना",
    "Sádhaná": "साधना",
    "sadhaka": "साधक",
    "sádhaka": "साधक",
    "sádhaka": "साधक",
    "Sádhaka": "साधक",
    "Sádhaka": "साधक",
    "sadhakas": "साधकास",
    "sádhakas": "साधकास",
    "sádhakas": "साधकास",
    "Sádhakas": "साधकास",
    "Sádhakas": "साधकास",
    "shudras": "शूद्रास",
    "shúdras": "शूद्रास",
    "shástras": "शास्त्रास्",
    "cárváka": "चारवाक्",
    "dvápara": "द्वापर",
    "dváparah": "द्वापरः",
    "bábá's": "बाबास्",
    "anucchunya": "अनुच्छुन्या",
    "anucchunyá": "अनुच्छुन्या",
    "anucchunyá": "अनुच्छुन्या",
    "biija": "बीज",
    "biijaḿ": "बीजं",
    "rddhi": "ऋद्धि",
    "ŕddhi": "ऋद्धि",
    "ṛddhi": "ऋद्धि",
    "siddhi": "सिद्दी",
    "Siddhi": "सिद्दी",
    "samrddhi": "समृद्धि",
    "samŕddhi": "समृद्धि",
    "samṛddhi": "समृद्धि",
    "saḿvrddhi": "संवृद्धि",
    "vashiikára-siddhi": "वशीकार-सिद्दी",
    "prápti-siddhi": "प्राप्ति-सिद्दी",
    "laghimá-siddhi": "लघिमा-सिद्दी",
    "pishácasiddhi": "पिशाचसिद्दी",
    "ańimá-siddhi": "अणिमा-सिद्दी",
    "prakámya-siddhi": "प्रकाम्य-सिद्दी",
    "pramá-rddhi": "प्रमा-ऋद्धि",
    "mahimá-siddhi": "महिमा-सिद्दी",
    "aśt́asiddhi": "अष्टसिद्दी",
    "siddhi-bháuṋ": "सिद्दी-भाङ",
    "bhavetsiddhirnányathá": "भवेत्सिद्दिर्नान्यथा",
    "káryasiddhirbhavati": "कार्यसिद्दिर्भवति",
    "kámabiija": "काम्बीज",
    "kámabiija": "काम्बीज",
    "kamabiija": "काम्बीज",
    "ásanas": "आसनास्",
    "ásanas": "आसनास्",
    "sadhika": "साधिका",
    "kiirtana": "कीर्तन",
    "kiirtan": "कीर्तन",
    "iishvara": "ईश्वर",
    "ishvara": "ईश्वर",
    "Ahamtattva": "अहमतत्त्व",
    "ahamtattva": "अहमतत्त्व",
    "Ahamatattva": "अहमतत्त्व",
    "ahamatattva": "अहमतत्त्व",
    "Ahaḿtattva": "अहमतत्त्व",
    "ahaḿtattva": "अहमतत्त्व",
    "ahaḿtattva": "अहमतत्त्व",
    "Mahattattva": "महत्तत्त्व",
    "mahattattva": "महत्तत्त्व",
    "Mahatattva": "महत्तत्त्व",
    "mahatattva": "महत्तत्त्व",
    "Bhútatattva": "भूततत्त्व",
    "Bhútatattva": "भूततत्त्व",
    "bhútatattva": "भूततत्त्व",
    "bhutatattva": "भूततत्त्व",
    "parama": "परम",
    "paramatma": "परमात्मा",
    "parama atma": "परमात्मा",
    "paramátma": "परमात्मा",
    "paramátmá": "परमात्मा",
    "paramátmá": "परमात्मा",
    "paramátman": "परमात्मन्",
    "paramatman": "परमात्मन्",
    "puruśa": "पुरुष",
    "purusa": "पुरुष",
    "puruśa": "पुरुष",
    "Puruśabháva": "पुरुषभाव",
    "puruśabháva": "पुरुषभाव",
    "puruśabháva": "पुरुषभाव",
    "purusabhava": "पुरुषभाव",
    "prakrti": "प्रकृति",
    "prakrtii": "प्रकृती",
    "prakrtih": "प्रकृतिः",
    "prakrtiḿ": "प्रकृतिं",
    "prakrtis": "प्रकृतिस्",
    "prakrti's": "प्रकृतिस्",
    "prakrtiliina": "प्रकृतिलीन",
    "prakrtitattva": "प्रकृतितत्त्व",
    "púrva": "पूर्व",
    "púrvá": "पूर्वा",
    "purva": "पूर्व",
    "púrvam": "पूर्वम्",
    "púrvaḿ": "पूर्वं",
    "púrvaka": "पूर्वक",
    "apúrva": "अपूर्व",
    "púrvamarśat": "पूर्वमर्षत्",
    "námapúrvakam": "नामपूर्वकम्",
    "púrvádra": "पूर्वाद्र",
    "púrváhńa": "पूर्वाह्ण",
    "púrvasthalii": "पूर्वस्थली",
    "púrvávasthá": "पूर्वावस्था",
    "púrvávasthápráptirphalabhogah": "पूर्वावस्थाप्राप्तिर्फलभोगः",
    "yudhiśt́hiira": "जुधिष्ठिर",
    "yudhiśt́hir": "जुधिष्ठिर",
    "yudhiśt́hira": "जुधिष्ठिर",
    "yudhiśt́hirah": "जुधिष्ठिर",
    "yáy": "जाय",
    "vṛddhaḥ": "वृद्धा:",
    "vrddhah": "वृद्धा:",
    "vrttvátyatiśt́haddasháḿgulam": "वृत्तात्यतिष्ठद्दशांगुलम्",
    "vrtvá'tyatiśt́haddasháḿgulam": "वृताऽत्यतिष्ठद्दशांगुलम्",
    "vrtvá'tyatiśt́haddasháuṋgulam": "वृताऽत्यतिष्ठद्दशाङ्गुलम्",
    "parama purusa": "परम पुरुष",
    "parama puruśa": "परम पुरुष",
    "sarvaḿ": "सर्वं",
    "sarvam": "सर्वं",
    "sarvájiive": "सर्वजीवे",
    "párvatii": "पार्वती",
    "parvatii": "पार्वती",
    "práńáyáma": "प्राणायाम",
    "práńáyáma": "प्राणायाम",
    "pranayama": "प्राणायाम",
    "náráyańa": "नारायण",
    "narayana": "नारायण",
    "nárada": "नारद",
    "narada": "नारद",
    "náradah": "नारदः",
    "rámáyańa": "रामायण",
    "ramayana": "रामायण",
    "avidyámaya": "अविद्यमया",
    "avidyámaya": "अविद्यमया",
    "avidyāmaya": "अविद्यमया",
    "avidyamáyá": "अविद्यमया",
    "avidyámáyá": "अविद्यामाया",
    "avidyamaya": "अविद्यमया",
    "vidyámáyá": "विद्यामाया",
    "vidyámaya": "विद्यामाया",
    "vidyamaya": "विद्यामाया",
    "bhúmácaetanya": "भूमाचैतन्य",
    "bhúmácaetanya": "भूमाचैतन्य",
    "bhumacaetanya": "भूमाचैतन्य",
    "bhúmá caetanya": "भूमाचैतन्य",
    "bhúmá caetanya": "भूमाचैतन्य",
    "bhuma caetanya": "भूमाचैतन्य",
    "bhava": "भव",
    "bháva": "भव",
    "saiṋcara": "संचर",
    "saiṋcara": "संचर",
    "saiñcara": "संचर",
    "saincara": "संचर",
    "bhutvá": "भुत्वा",
    "bhútvá": "भूत्वा",
    "citishakti": "चितिशक्ति",
    "caetanya": "चैतन्य",
    "prakrti": "प्रकृति",
    "prakrtiḥ": "प्रकृतिः",
    "brahma": "ब्रह्म",
    "brahmá": "ब्रह्मा",
    "brahmá": "ब्रह्मा",
    "brahmaa": "ब्रह्मा",
    "brahmacarya": "ब्रह्मचर्य",
    "mahat": "महत्",
    "aham": "अहम्",
    "diikśá": "दीक्षा",
    "diiksha": "दीक्षा",
    "citta": "चित्त",
    "cakra": "चक्र",
    "cakras": "चक्र",
    "mantra": "मन्त्र",
    "mantras": "मन्त्रास्",
    "tantra": "तन्त्र",
    "yoga": "जोग",
    "yogii": "जोगी",
    "yogi": "जोगी",
    "kaośikii": "कौशिकी",
    "kaoshikii": "कौशिकी",
    "tandava": "ताण्डव",
    "táńd́ava": "ताण्डव",
    "śiva": "शिव",
    "śiva": "शिव",
    "shiva": "शिव",
    "krśńa": "कृष्ण",
    "krśna": "कृष्ण",
    "krsná": "कृष्ण",
    "krśńa": "कृष्ण",
    "krśńa's": "कृष्णास",
    "krsna": "कृष्ण",
    "krishna": "कृष्ण",
    "ráma": "राम",
    "rama": "राम",
    "veda": "वेद",
    "vedas": "वेद",
    "vedika": "वैदिक",
    "vaedika": "वैदिक",
    "giita": "गीता",
    "gita": "गीता",
    "bhagavad": "भगवद्",
    "bhagavad giita": "भगवद् गीता",
    "bhagavad gita": "भगवद् गीता",
    "sútra": "सूत्र",
    "sutra": "सूत्र",
    "sútram": "सूत्रम्",
    "sutram": "सूत्रम्",
    "ánanda sútram": "आनन्द सूत्रम्",
    "ananda sutram": "आनन्द सूत्रम्",
    "ánanda sútra": "आनन्द सूत्र",
    "ananda sutra": "आनन्द सूत्र",
    "marga": "मार्ग",
    "márga": "मार्ग",
    "ananda marga": "आनन्द मार्ग",
    "ánanda márga": "आनन्द मार्ग",
    "mokśa": "मोक्ष",
    "mokśa": "मोक्ष",
    "moksa": "मोक्ष",
    "mukti": "मुक्ति",
    "múladhára": "मूलाधार",
    "múladhára": "मूलाधार",
    "múládhára": "मूलाधार",
    "múládhára": "मूलाधार",
    "muladhara": "मूलाधार",
    "nirvikalpa": "निर्विकल्प",
    "nirvikalpasamádhi": "निर्विकल्पसमाधि",
    "nirvikalpasamádhih": "निर्विकल्पसमाधिः",
    "nirvikalpasamadhi": "निर्विकल्पसमाधि",
    "nirvikalpasamadhih": "निर्विकल्पसमाधिः",
    "samádhi": "समाधि",
    "samadhi": "समाधि",
    "sattva": "सत्त्व",
    "rajah": "रजः",
    "tamah": "तमः",
    "guna": "गुण",
    "guńa": "गुण",
    "gunas": "गुण",
    "guńás": "गुणास्",
    "guńás": "गुणास्",
    "puńya": "पुण्य",
    "punya": "पुण्य",
    "váyu": "वायु",
    "vayu": "वायु",
    "váyus": "वायुस्",
    "vayus": "वायुस्",
    "váyuh": "वायुः",
    "váyutattva": "वायुतत्त्व",
    "váyubhúta": "वायुभूत",
    "váyuputra": "वायुपुत्र",
    "vári": "वारि",
    "váricarah": "वारिचरः",
    "niiram": "नीरं",
    "toyam": "तोयं",
    "udakam": "उदकं",
    "jalaḿ": "जलं",
    "ápa": "आप",
    "kurukśetra": "कुरुक्षेत्र",
    "kurukshetra": "कुरुक्षेत्र",
    "dharmakśetra": "धर्मक्षेत्र",
    "dharmakshetra": "धर्मक्षेत्र",
    "kośa": "कोष",
    "kosa": "कोष",
    "prańa": "प्राण",
    "prana": "प्राण",
    "manah": "मनः",
    "jiṋána": "ज्ञान",
    "jiṋána": "ज्ञान",
    "jiṋána": "ज्ञान",
    "Jiṋána": "ज्ञान",
    "jinana": "ज्ञान",
    "jnána": "ज्ञान",
    "jnana": "ज्ञान",
    "jiṋánii": "ज्ञानी",
    "jiṋánii": "ज्ञानी",
    "jiṋánii": "ज्ञानी",
    "Jiṋánii": "ज्ञानी",
    "jinanii": "ज्ञानी",
    "jnánii": "ज्ञानी",
    "jnanii": "ज्ञानी",
    "rśi": "ऋषि",
    "rśi": "ऋषि",
    "rśis": "ऋषिस्",
    "rśis": "ऋषिस्",
    "rśis'": "ऋषिस्",
    "rśis'": "ऋषिस्",
    "cháyá": "छाया",
    "chaya": "छाया",
    "aṋ": "अँ",
    "aṋ": "अँ",
    "aḿ": "अं",
    "aḿ": "अं",
    "ah": "अः",
    "jiṋa": "ज्ञ",
    "jiṋá": "ज्ञा",
    "jiṋa": "ज्ञ",
    "jiṋá": "ज्ञा",
    "Jiṋátá": "ज्ञाता",
    "jiṋátá": "ज्ञाता",
    "Jiṋátá": "ज्ञाता",
    "jiṋátá": "ज्ञाता",
    "jiṋatá": "ज्ञाता",
    "jiṋánashakti": "ज्ञानशक्ति",
    "jiṋánashakti": "ज्ञानशक्ति",
    "jiṋánashakti": "ज्ञानशक्ति",
    "jiṋánashakti": "ज्ञानशक्ति",
    "sadrsha parinama": "सदृश परिणाम",
    "sadrsha parińáma": "सदृश परिणाम",
    "sadrshaparińáma": "सदृशपरिणाम",
    "sadrshaparińámena": "सदृशपरिणामेन",
    "sadrśa pariṇāma": "सदृश परिणाम",
    "sadṛśa pariṇāma": "सदृश परिणाम",
    "saḿskrta": "संस्कृत",
    "tato'haḿ": "ततोऽहं",
    "tato’haḿ": "ततोऽहं",
    "tato’haḿ": "ततोऽहं",
    "piuṋgalá": "पिङ्गला",
    "piuṋgalá": "पिङ्गला",
    "ghaiṋ": "घञ्",
    "ghaiṋ": "घञ्",
    "ghain": "घञ्",
    "ghain̰": "घञ्",
    "ghaiñ": "घञ्",
    "bhakti": "भक्ति",
    "shakti": "शक्ति",
    "śakti": "शक्ति",
    "máyá": "माया",
    "máyá": "माया",
    "maya": "माया",
    "máyádhiina": "मायाधीन",
    "máyádviipa": "मायादीप",
    "máyántu": "मायान्तु",
    "máyáya": "मायाय",
    "máyáy": "मायाय्",
    "máyáváda": "मायावाद",
    "máyávada": "मायावाद",
    "máyávada": "मायावाद",
    "mayavada": "मायावाद",
    "máyávádins": "मायावादिनस्",
    "máyávádins": "मायावादिनस्",
    "mayavadins": "मायावादिनस्",
  }));
  const AMPS_YA_UCCHARANA_WORDS = {
    "vidyámáyá": "विद्यामाया",
    "máyámetáḿ": "मायामेतां",
    "'máyámetáḿ": "मायामेतां",
    "mahámáyá": "महामाया",
    "vishvamáyá": "विश्वमाया",
    "viśńumáyá": "विष्णुमाया",
    "ańumáyá": "अणुमाया",
    "yogamáyá": "योगमाया",
    "vishvamáyánivrttih": "विश्वमायानिवृत्तिः",
    "pratyaváya": "प्रत्यवाय",
    "paritráńáya": "परित्राणाय",
    "shiváya": "शिवाय",
    "vinásháya": "विनाशाय",
    "shántáya": "शान्ताय",
    "dharmasaḿsthápanártháya": "धर्मसंस्थापनार्थाय",
    "agraháyańa": "अग्रहायण",
    "guháyám": "गुहायाम्",
    "guháyáḿ": "गुहायां",
    "svádhyáya": "स्वाध्याय",
    "puńyam": "पुण्यम्",
    "puńyáya": "पुण्याय",
    "puńyamahorátram": "पुण्यमहोरात्रम्",
    "puńyamahorátraḿ": "पुण्यमहोरात्रं",
    "nyáya": "न्याय",
    "pápáya": "पापाय",
    "kámáya": "कामाय",
    "puruśottamáya": "पुरुषोत्तमाय",
    "jagaddhitáya": "जगद्धिताय",
    "dvitiiyáya": "द्वितीयाय",
    "prakásháya": "प्रकाशाय",
    "viháya": "विहाय",
    "hitáya": "हिताय",
    "púrńamádáya": "पूर्णमादाय",
    "sakháyá": "सखाया",
    "jiivitáshayá": "जीविताशया",
    "áshayá": "आशया",
    "manuśya": "मनुष्य",
    "manuśyánáḿ": "मनुष्यनां",
    "manuśyáńáḿ": "मनुष्याणां",
    "bhaviśyati": "भविष्यति",
    "phaliśyatiiti": "फलिष्यतीति",
    "mokśayiśyámi": "मोक्षयिष्यामि",
    "stúyate": "स्तूयते",
    "rtáyate": "ऋतायते",
    "gopáyate": "गोपायते",
    "caetanyamupajáyate": "चैतन्यमुपजायते",
    "jáyate": "जायते",
    "prajáyate": "प्रजायते",
    "pravrttirúpajáyate": "प्रवृत्तिरूपजायते",
    "kámábhirjjáyate": "कामाभिर्ज्जायते",
    "távannajáyate": "तावन्नजायते",
    "prjáyate": "प्रजायते",
    "srjámyáham": "सृजाम्याहम्",
    "srjámyaham": "सृजाम्यहम्",
    "yuktiyuktamupádeyaḿ": "युक्तियुक्तमुपादेयं",
  };
  Object.entries(AMPS_YA_UCCHARANA_WORDS).forEach(([roman, dev]) => AMPS_WORDS.set(roman, dev));

  const PHRASE_KEYS = Array.from(AMPS_WORDS.keys())
    .filter(k => k.includes(" "))
    .sort((a, b) => b.length - a.length);
  const AMPS_SINGLE_VOICE_WORDS = new Map(Object.entries({
    "saḿskrta": "sans-krit", "saḿskrta": "sans-krit", "samskrta": "sans-krit", "sanskrit": "sans-krit",
    "saḿskrtaṃ": "sans-kri-tam", "sanskrita": "sans-krit",
    "oṋḿ": "om",
    "saḿskáras": "sang-skaa-raas", "samskáras": "sang-skaa-raas",
    "ánanda": "aa-nan-da",
    "ánandamúrti": "Aanandmoorti", "ánandamúrtiji": "Aanandmoorti", "ánandamúrtijii": "Aanandmoorti",
    "anandamurti": "Aanandmoorti", "anandamurtiji": "Aanandmoorti", "anandamurtijii": "Aanandmoorti",
    "shrii shrii anandamurti": "Shree Shree Aanandmoorti", "shrii shrii ánandamúrti": "Shree Shree Aanandmoorti",
    "shrii": "shree",
    "sadhana": "saadhnaa", "sádhaná": "Saadhnaa", "sádhaná": "Saadhnaa",
    "Sádhaná": "Saadhnaa", "Sádhaná": "Saadhnaa",
    "ásanas": "aasanaas", "ásanas": "aasanaas",
    "sadhaka": "saadhak", "sádhaka": "saadhak", "sádhaka": "saadhak", "Sádhaka": "Saadhak", "Sádhaka": "Saadhak",
    "sadhakas": "saadhkaas", "sádhakas": "saadhkaas", "sádhakas": "saadhkaas", "Sádhakas": "Saadhkaas", "Sádhakas": "Saadhkaas",
    "shudras": "shoo-draas", "shúdras": "shoo-draas",
    "shástras": "shaas-traas",
    "cárváka": "chaar-vaak",
    "dvápara": "dvaa-pa-ra",
    "dváparah": "dvaa-pa-rah",
    "bábá's": "baa-baas",
    "anucchunya": "anu-chchhun-yaa", "anucchunyá": "anu-chchhun-yaa", "anucchunyá": "anu-chchhun-yaa",
    "biija": "beej", "biijaḿ": "beejam",
    "rddhi": "rid-dhi", "ŕddhi": "rid-dhi", "ṛddhi": "rid-dhi",
    "siddhi": "sid-dee", "Siddhi": "sid-dee",
    "samrddhi": "sam-rid-dhi", "samŕddhi": "sam-rid-dhi", "samṛddhi": "sam-rid-dhi",
    "saḿvrddhi": "sam-vrid-dhi",
    "vashiikára-siddhi": "va-shee-kaa-ra sid-dee",
    "prápti-siddhi": "praap-ti sid-dee",
    "laghimá-siddhi": "la-ghi-maa sid-dee",
    "pishácasiddhi": "pi-shaa-cha-sid-dee",
    "ańimá-siddhi": "a-ni-maa sid-dee",
    "prakámya-siddhi": "pra-kaa-mya sid-dee",
    "pramá-rddhi": "pra-maa rid-dhi",
    "mahimá-siddhi": "ma-hi-maa sid-dee",
    "aśt́asiddhi": "ash-ta-sid-dee",
    "siddhi-bháuṋ": "sid-dee bhaang",
    "bhavetsiddhirnányathá": "bha-vet-sid-dir-naan-ya-thaa",
    "káryasiddhirbhavati": "kaar-ya-sid-dir-bha-va-ti",
    "kámabiija": "kaam-beej", "kámabiija": "kaam-beej", "kamabiija": "kaam-beej",
    "dharma": "dhar-ma", "svadharma": "swa-dhar-ma", "puruśa": "pu-roo-sh", "puruśa": "pu-roo-sh",
    "parama purusa": "param purus", "parama puruśa": "param purus", "parama puruśa": "param purus",
    "Puruśabháva": "pu-roosh-bhaav", "puruśabháva": "pu-roosh-bhaav",
    "puruśabháva": "pu-roosh-bhaav", "purusabhava": "pu-roosh-bhaav",
    "purusa": "pu-roo-sha", "parama": "pa-ra-ma", "paramátma": "pa-ra-maat-ma",
    "púrva": "poor-va", "púrvá": "poor-vaa", "purva": "poor-va", "púrvam": "poor-vam", "púrvaḿ": "poor-vam",
    "púrvaka": "poor-va-ka", "apúrva": "a-poor-va", "púrvamarśat": "poor-va-mar-shat",
    "námapúrvakam": "naa-ma-poor-va-kam",
    "púrvádra": "poor-vaa-dra", "púrváhńa": "poor-vaah-na",
    "púrvasthalii": "poor-va-stha-lee",
    "púrvávasthá": "poor-vaa-vas-thaa", "púrvávasthápráptirphalabhogah": "poor-vaa-vas-thaa-praap-tir-pha-la-bho-gah",
    "yudhiśt́hiira": "ju-dhish-thir", "yudhiśt́hir": "ju-dhish-thir", "yudhiśt́hira": "ju-dhish-thir", "yudhiśt́hirah": "ju-dhish-thir",
    "yáy": "jaa-y",
    "vṛddhaḥ": "vrid-dhaa", "vrddhah": "vrid-dhaa",
    "vrttvátyatiśt́haddasháḿgulam": "vrit-taa-tya-tish-thad-da-shaan-gu-lam",
    "vrtvá'tyatiśt́haddasháḿgulam": "vri-taa-tya-tish-thad-da-shaan-gu-lam",
    "vrtvá'tyatiśt́haddasháuṋgulam": "vri-taa-tya-tish-thad-da-shaang-gu-lam",
    "paramátma": "pa-ra-maat-ma", "brahma": "brahm", "brahmá": "brah-maa",
    "sarvaḿ": "sar-vam", "sarvam": "sar-vam",
    "sarvájiive": "sar-va-jee-ve",
    "párvatii": "paar-va-tee", "parvatii": "paar-va-tee",
    "práńáyáma": "praanaayaam", "práńáyáma": "praanaayaam", "pranayama": "praanaayaam",
    "diikśá": "deek-shaa", "diiksha": "deek-shaa",
    "citta": "chit-ta", "citishakti": "chiti-shakti", "caetanya": "chai-tan-ya",
    "náráyańa": "naa-raa-ya-na", "narayana": "naa-raa-ya-na",
    "nárada": "naa-ra-da", "narada": "naa-ra-da", "náradah": "naa-ra-dah",
    "rámáyańa": "raa-maa-ya-na", "ramayana": "raa-maa-ya-na",
    "avidyámaya": "a-vid-ya-ma-ya", "avidyámaya": "a-vid-ya-ma-ya", "avidyāmaya": "a-vid-ya-ma-ya",
    "avidyamáyá": "a-vid-ya-ma-ya",
    "avidyámáyá": "a-vid-yaa-maa-yaa", "avidyamaya": "a-vid-yaa-maa-yaa",
    "bhúmácaetanya": "bhoo-maa chai-tan-ya", "bhumacaetanya": "bhoo-maa chai-tan-ya",
    "bhava": "bha-va", "bháva": "bha-va",
    "saiṋcara": "sanchar", "saiṋcara": "sanchar", "saiñcara": "sanchar", "saincara": "sanchar", "pratisaiṋcara": "pra-ti-sanchar",
    "bhutvá": "bhu-tvaa", "bhútvá": "bhoo-tvaa",
    "prakrti": "prakriti", "prakrtii": "prakritee", "prakrtih": "prakritih", "prakrtiḿ": "prakritim", "prakrtis": "prakritis",
    "prakrti's": "prakritis", "prakrtiliina": "prakriti-lee-na", "prakrtitattva": "prakriti-tattva",
    "mantra": "man-tra", "mantras": "man-traas", "tantra": "tan-tra", "yoga": "jo-ga",
    "Ahaḿtattva": "Aham-tattva", "ahaḿtattva": "aham-tattva", "ahaḿtattva": "aham-tattva",
    "yogii": "jo-gee", "kiirtana": "keer-tan", "kiirtan": "keer-tan", "iishvara": "Eeshwar",
    "Iishvara": "Eeshwar", "ishvara": "Eeshwar", "Ishvara": "Eeshwar",
    "śiva": "shiv", "śiva": "shiv", "shiva": "shiv", "krśńa": "krishn", "krśna": "krishn", "krsná": "krishn", "krśńa": "krishn", "krsna": "krishn", "krishna": "krishn",
    "sútra": "soo-tra", "sutra": "soo-tra", "sútram": "soo-tram", "sutram": "soo-tram",
    "múladhára": "moo-laa-dhaa-ra", "múládhára": "moo-laa-dhaa-ra", "muladhara": "moo-laa-dhaa-ra",
    "nirvikalpa": "nir-vi-kal-pa", "nirvikalpasamádhi": "nir-vi-kal-pa-sa-maa-dhi",
    "nirvikalpasamádhih": "nir-vi-kal-pa-sa-maa-dhih", "nirvikalpasamadhi": "nir-vi-kal-pa-sa-maa-dhi",
    "nirvikalpasamadhih": "nir-vi-kal-pa-sa-maa-dhih",
    "mokśa": "mok-sha", "mokśa": "mok-sha", "moksa": "mok-sha", "guńás": "gu-naas", "guńás": "gu-naas",
    "puńya": "pun-ya", "punya": "pun-ya", "váyu": "vaa-yu", "vayu": "vaa-yu", "váyus": "vaa-yus", "vayus": "vaa-yus",
    "váyuh": "vaa-yuh", "váyutattva": "vaa-yu-tat-tva", "váyubhúta": "vaa-yu-bhoo-ta", "váyuputra": "vaa-yu-putra",
    "vári": "vaa-ri", "váricarah": "vaa-ri-cha-rah", "niiram": "nee-ram", "toyam": "to-yam", "udakam": "u-da-kam", "jalaḿ": "ja-lam", "ápa": "aa-pa",
    "kurukśetra": "ku-ru-kshe-tra", "dharmakśetra": "dhar-ma-kshe-tra",
    "krśńa's": "krish-naas", "samadhi": "sa-maa-dhi", "samádhi": "sa-maa-dhi", "samádhi": "sa-maa-dhi",
    "jiṋa": "gya", "jiṋa": "gya", "jiṋá": "gyaa", "jiṋá": "gyaa",
    "Jiṋátá": "Gyaataa", "jiṋátá": "gyaataa",
    "Jiṋátá": "Gyaataa", "jiṋátá": "gyaataa", "jiṋatá": "gyaataa",
    "jiṋána": "gyaana", "jiṋána": "gyaana", "jiṋána": "gyaana", "jinana": "gyaana", "jnana": "gyaana",
    "jiṋánii": "gyaanee", "jiṋánii": "gyaanee", "jiṋánii": "gyaanee", "jinanii": "gyaanee", "jnanii": "gyaanee",
    "jiṋánashakti": "gyaanashakti", "jiṋánashakti": "gyaanashakti",
    "jiṋánashakti": "gyaanashakti", "jiṋánashakti": "gyaanashakti",
    "sadrsha parinama": "sa-drish pa-ri-naam",
    "sadrsha parińáma": "sa-drish pa-ri-naam",
    "sadrshaparińáma": "sa-drish-pa-ri-naam",
    "sadrshaparińámena": "sa-drish-pa-ri-naa-me-na",
    "sadrśa pariṇāma": "sa-drish pa-ri-naam",
    "sadṛśa pariṇāma": "sa-drish pa-ri-naam",
    "jin̰ána": "gyaana", "jiɒána": "gyaana", "bhakti": "bhak-ti",
    "shakti": "shak-ti", "śakti": "shak-ti", "máyá": "maa-yaa", "máyá": "maa-yaa",
    "máyádhiina": "maa-yaa-dheen", "máyádviipa": "maa-yaa-deep", "máyántu": "maa-yaan-tu", "máyáya": "maa-yaa-ya", "máyáy": "maa-yaa-y",
    "máyáváda": "maa-yaa-vaad", "máyávada": "maa-yaa-vaad",
    "mayavada": "maa-yaa-vaad", "máyávádins": "maa-yaa-vaa-dins", "mayavadins": "maa-yaa-vaa-dins", "marga": "maar-ga",
    "ghaiṋ": "ghanj", "ghaiṋ": "ghanj", "ghain": "ghanj", "ghain̰": "ghanj", "ghaiñ": "ghanj",
    "márga": "maar-ga", "prańa": "praa-na", "prana": "praa-na", "kośa": "ko-sha",
    "rśi": "ri-shi", "rśi": "ri-shi", "rśis": "ri-shis", "rśis": "ri-shis", "rśis'": "ri-shis", "rśis'": "ri-shis",
    "icchábiija": "ich-chhaa-bee-ja", "icchabiija": "ich-chhaa-bee-ja",
    "iccha biija": "ich-chhaa bee-ja",
    "icchábíija": "ich-chhaa-bee-ja",
    "स्वरूपपरिणाम": "swa-roop-pa-ri-naam",
    "svarúpaparińáma": "swa-roop-pa-ri-naam",
    "svarūpapariṇāma": "swa-roop-pa-ri-naam",
    "svarupaparinama": "swa-roop-pa-ri-naam",
    "svaruupaparinama": "swa-roop-pa-ri-naam",
    "svarupa parinama": "swa-roop pa-ri-naam",
    "Mahattattva": "Mahat-tattva", "mahattattva": "mahat-tattva",
    "Mahatattva": "Mahat-tattva", "mahatattva": "mahat-tattva",
    "Ahamtattva": "Aham-tattva", "ahamtattva": "aham-tattva",
    "Ahamatattva": "Aham-tattva", "ahamatattva": "aham-tattva",
    "Bhútatattva": "Bhoo-ta-tat-tva", "Bhútatattva": "Bhoo-ta-tat-tva",
    "bhútatattva": "bhoo-ta-tat-tva", "bhutatattva": "bhoo-ta-tat-tva",
    "Citta": "Chit-ta", "citta": "chit-ta"
  }));
  const SPEECH_PHRASE_KEYS = Array.from(AMPS_SINGLE_VOICE_WORDS.keys())
    .filter(k => k.includes(" "))
    .sort((a, b) => b.length - a.length);
  const AMPS_YA_SINGLE_VOICE_WORDS = {
    "vidyámáyá": "vid-yaa-maa-yaa", "vidyámaya": "vid-yaa-maa-yaa", "vidyamaya": "vid-yaa-maa-yaa",
    "máyámetáḿ": "maa-yaa-me-taam",
    "'máyámetáḿ": "maa-yaa-me-taam",
    "mahámáyá": "ma-haa-maa-yaa",
    "vishvamáyá": "vish-va-maa-yaa",
    "viśńumáyá": "vish-nu-maa-yaa",
    "ańumáyá": "a-nu-maa-yaa",
    "yogamáyá": "jo-ga-maa-yaa",
    "vishvamáyánivrttih": "vish-va-maa-yaa-ni-vrit-tih",
    "pratyaváya": "pra-tya-vaa-ya",
    "paritráńáya": "pa-ri-traa-naa-ya",
    "shiváya": "shi-vaa-ya",
    "vinásháya": "vi-naa-shaa-ya",
    "shántáya": "shaan-taa-ya",
    "dharmasaḿsthápanártháya": "dhar-ma-sam-sthaa-pa-naar-thaa-ya",
    "agraháyańa": "a-gra-haa-ya-na",
    "guháyám": "gu-haa-yaam",
    "guháyáḿ": "gu-haa-yaam",
    "svádhyáya": "swaa-dhyaa-ya",
    "puńyam": "pun-yam",
    "puńyáya": "pun-yaa-ya",
    "puńyamahorátram": "pun-ya-ma-ho-raa-tram",
    "puńyamahorátraḿ": "pun-ya-ma-ho-raa-tram",
    "nyáya": "nyaa-ya",
    "pápáya": "paa-paa-ya",
    "kámáya": "kaa-maa-ya",
    "puruśottamáya": "pu-ru-shot-ta-maa-ya",
    "jagaddhitáya": "ja-gad-dhi-taa-ya",
    "dvitiiyáya": "dvi-tee-yaa-ya",
    "prakásháya": "pra-kaa-shaa-ya",
    "viháya": "vi-haa-ya",
    "hitáya": "hi-taa-ya",
    "púrńamádáya": "poor-na-maa-daa-ya",
    "sakháyá": "sa-khaa-yaa",
    "jiivitáshayá": "jee-vi-taa-sha-yaa",
    "áshayá": "aa-sha-yaa",
    "manuśya": "ma-nush-ya",
    "manuśyánáḿ": "ma-nush-yaa-naam",
    "manuśyáńáḿ": "ma-nush-yaa-naam",
    "bhaviśyati": "bha-vish-ya-ti",
    "phaliśyatiiti": "pha-lish-ya-tee-ti",
    "mokśayiśyámi": "mok-sha-yish-yaa-mi",
    "stúyate": "stoo-ya-te",
    "rtáyate": "ri-taa-ya-te",
    "gopáyate": "go-paa-ya-te",
    "caetanyamupajáyate": "chai-tan-yam-u-pa-jaa-ya-te",
    "jáyate": "jaa-ya-te",
    "prajáyate": "pra-jaa-ya-te",
    "pravrttirúpajáyate": "pra-vrit-tir-oo-pa-jaa-ya-te",
    "kámábhirjjáyate": "kaa-maa-bhirj-jaa-ya-te",
    "távannajáyate": "taa-van-na-jaa-ya-te",
    "prjáyate": "pra-jaa-ya-te",
    "srjámyáham": "sri-jaa-myaa-ham",
    "srjámyaham": "sri-jaa-mya-ham",
    "yuktiyuktamupádeyaḿ": "yuk-ti-yuk-tam-u-paa-de-yam",
    "Avidyámáya": "A-vid-yaa-maa-ya"
  };
  Object.entries(AMPS_YA_SINGLE_VOICE_WORDS).forEach(([roman, speech]) => AMPS_SINGLE_VOICE_WORDS.set(roman, speech));
  const AMPS_VERIFIED_PHRASES = [
    {
      text: "माता कस्य पिता कस्य कस्य भ्राता सहोदरा। कायप्राणे न सम्बन्दः वृथा का परिवेदना॥",
      spoken: "maa taa kas-ya, pi taa kas-ya, kas-ya bhraa taa sa-ho-da-raa. kaa-ya praa-ne na sam-ban-dhah, vri-thaa kaa pa-ri-ve-da-naa.",
    },
    {
      text: "Mátá kasya pitá kasya kasya bhrátá sahodará; káyapráńe na sambandhah vrthá ká parivedaná.",
      spoken: "maa taa kas-ya, pi taa kas-ya, kas-ya bhraa taa sa-ho-da-raa. kaa-ya praa-ne na sam-ban-dhah, vri-thaa kaa pa-ri-ve-da-naa.",
    },
  ];
  const ENGLISH_STOP_WORDS = new Set([
    "a", "an", "the", "and", "are", "as", "at", "base", "be", "been", "being", "but", "by",
    "can", "could", "did", "do", "does", "for", "from", "had", "has", "have", "he",
    "her", "here", "him", "his", "i", "if", "in", "is", "it", "its", "may", "more",
    "already", "barren", "like", "same", "some", "then", "not", "of", "on", "one", "or", "our", "she", "should", "that", "their", "there",
    "take", "these", "they", "this", "those", "thought", "to", "was", "we", "were", "what", "when",
    "water", "where", "which", "who", "will", "with", "would", "you", "your",
  ]);
  const USER_PRONUNCIATION_STORAGE = "amps-pronunciation-overrides-v1";
  let userPronunciationCache = null;

  function userPronunciationMap() {
    if (userPronunciationCache) return userPronunciationCache;
    const map = new Map();
    try {
      const rows = JSON.parse(localStorage.getItem(USER_PRONUNCIATION_STORAGE) || "[]");
      (Array.isArray(rows) ? rows : []).forEach(row => {
        const roman = String(row?.roman || "").trim();
        const dev = String(row?.devanagari || "").trim();
        if (!roman || !dev) return;
        map.set(exactRomanKey(roman), dev);
        map.set(stripRomanMarks(roman), dev);
        map.set(romanSpeechKey(roman), dev);
      });
    } catch (_) { /* ignore */ }
    userPronunciationCache = map;
    return map;
  }

  function userSpeechMap() {
    const map = new Map();
    try {
      const rows = JSON.parse(localStorage.getItem(USER_PRONUNCIATION_STORAGE) || "[]");
      (Array.isArray(rows) ? rows : []).forEach(row => {
        const roman = String(row?.roman || "").trim();
        const speech = String(row?.speech || "").trim();
        if (!roman || !speech) return;
        map.set(exactRomanKey(roman), speech);
        map.set(stripRomanMarks(roman), speech);
        map.set(romanSpeechKey(roman), speech);
      });
    } catch (_) { /* ignore */ }
    return map;
  }

  function resetUserPronunciationCache() {
    userPronunciationCache = null;
  }

  let libraryPronunciationPromise = null;
  let libraryPronunciationMap = null;
  let librarySpeechMap = null;
  const AUDIO_ASSET_BASE = (() => {
    try {
      const scriptUrl = document.currentScript?.src || "amps-reader-audio.js";
      return new URL(".", new URL(scriptUrl, location.href));
    } catch (_) {
      return new URL("./", location.href);
    }
  })();

  function audioAssetUrl(path) {
    return new URL(String(path || "").replace(/^\.\//, ""), AUDIO_ASSET_BASE).toString();
  }

  function stripRomanMarks(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’‘`]/g, "'")
      .replace(/[^a-z0-9' ]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function exactRomanKey(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFC")
      .replace(/[’‘`]/g, "'")
      .trim();
  }

  const VOWELS = {
    a: { indep: "अ", matra: "" },
    aa: { indep: "आ", matra: "ा" },
    i: { indep: "इ", matra: "ि" },
    ii: { indep: "ई", matra: "ी" },
    u: { indep: "उ", matra: "ु" },
    uu: { indep: "ऊ", matra: "ू" },
    r: { indep: "ऋ", matra: "ृ" },
    e: { indep: "ए", matra: "े" },
    ai: { indep: "ऐ", matra: "ै" },
    o: { indep: "ओ", matra: "ो" },
    au: { indep: "औ", matra: "ौ" },
  };

  const CONSONANTS = {
    kh: "ख", gh: "घ", ch: "छ", jh: "झ", th: "थ", dh: "ध", ph: "फ", bh: "भ",
    sh: "श", ks: "क्ष", jn: "ज्ञ", gy: "ज्ञ", tr: "त्र",
    k: "क", g: "ग", c: "च", j: "ज", t: "त", d: "द", n: "न", p: "प", b: "ब", m: "म",
    y: "य", r: "र", l: "ल", v: "व", w: "व", s: "स", h: "ह",
  };

  function romanSpeechKey(text) {
    return stripRomanMarks(text)
      .replace(/\bshrii\b/g, "shri")
      .replace(/aa/g, "a")
      .replace(/ii/g, "i")
      .replace(/uu/g, "u");
  }

  async function loadLibraryPronunciationMap() {
    if (libraryPronunciationMap) return libraryPronunciationMap;
    if (libraryPronunciationPromise) return libraryPronunciationPromise;
    libraryPronunciationPromise = fetch(audioAssetUrl("data/amps-pronunciation-dictionary.json"))
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const map = new Map();
        const speechMap = new Map();
        (data?.entries || []).forEach(row => {
          const roman = String(row?.roman || "").trim();
          const dev = String(row?.devanagari || "").trim();
          const speech = String(row?.speech || "").trim();
          if (!roman || !dev) return;
          // Keep generated entries exact. Accent-stripped aliases can collide
          // with English words (for example sáme -> same).
          map.set(exactRomanKey(roman), dev);
          if (speech) {
            speechMap.set(exactRomanKey(roman), speech);
            speechMap.set(stripRomanMarks(roman), speech);
            speechMap.set(romanSpeechKey(roman), speech);
          }
        });
        libraryPronunciationMap = map;
        librarySpeechMap = speechMap;
        try {
          const dictRev = String(data?.generatedAt || data?.count || "").trim();
          if (dictRev) localStorage.setItem("amps-pronunciation-dict-rev-v1", dictRev);
        } catch (_) { /* ignore */ }
        return map;
      })
      .catch(() => {
        libraryPronunciationMap = new Map();
        librarySpeechMap = new Map();
        return libraryPronunciationMap;
      });
    return libraryPronunciationPromise;
  }

  function normalizeRomanForDevanagari(raw) {
    return String(raw || "")
      .normalize("NFD")
      .replace(/a\u0301|ā|á/g, "aa")
      .replace(/i\u0301|ī|í/g, "ii")
      .replace(/u\u0301|ū|ú/g, "uu")
      .replace(/r\u0301|ṛ/g, "r")
      .replace(/p\u0301/g, "p")
      .replace(/m\u0301|ṁ|ṃ/g, "m")
      .replace(/n\u0330|ṅ|ṋ|ñ|n\u0301|ń|ṇ/g, "n")
      .replace(/s\u0301|ś|ṣ/g, "sh")
      .replace(/t\u0301|ṭ/g, "t")
      .replace(/d\u0301|ḍ/g, "d")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’‘`]/g, "'")
      .toLowerCase();
  }

  function normalizeAmpsRomanPronunciation(raw) {
    let s = String(raw || "").normalize("NFC");
    if (!s) return s;
    // AMPS/Bengali Saṁskrta pronunciation: d́/d́h in medial or final
    // positions are pronounced as cerebral ŕ/ŕh.
    s = s.replace(/([A-Za-zÁĀÍĪÚŪáāíīúūḿṁṃńṇṅṋñśṣṭḍṛḷṝ])d́h/gu, "$1ŕh");
    s = s.replace(/([A-Za-zÁĀÍĪÚŪáāíīúūḿṁṃńṇṅṋñśṣṭḍṛḷṝ])d́/gu, "$1ŕ");
    s = s.replace(/([A-Za-zÁĀÍĪÚŪáāíīúūḿṁṃńṇṅṋñśṣṭḍṛḷṝ])ḍh/gu, "$1ŕh");
    s = s.replace(/([A-Za-zÁĀÍĪÚŪáāíīúūḿṁṃńṇṅṋñśṣṭḍṛḷṝ])ḍ/gu, "$1ŕ");
    // kś/kś/kṣ is read as kh in this pronunciation key.
    s = s.replace(/kś|kś|kṣ/giu, "kh");
    // Only word-initial y is pronounced like j. Medial and final y remain y.
    s = s.replace(new RegExp(`(^|[^${ROMAN_SAMSKRTA_LETTER_CLASS}])y`, "gu"), (_, lead) => `${lead}j`);
    s = s.replace(new RegExp(`(^|[^${ROMAN_SAMSKRTA_LETTER_CLASS}])Y`, "gu"), (_, lead) => `${lead}J`);
    // v after a consonant is silent in the supplied pronunciation key.
    s = s.replace(/([kgcjtdnpbmsśṣrlh])v(?=[aáāiíīuúūeo])/giu, "$1");
    // s/sh before r, t, or th keeps a plain s sound.
    s = s.replace(/\bsh(?=r|t|th)/giu, "s");
    s = s.replace(/ś(?=r|t|th)/giu, "s");
    return s;
  }

  function readVowel(s, i) {
    const two = s.slice(i, i + 2);
    if (VOWELS[two]) return { key: two, len: 2 };
    const one = s[i];
    if (VOWELS[one]) return { key: one, len: 1 };
    return null;
  }

  function readConsonant(s, i) {
    const two = s.slice(i, i + 2);
    if (CONSONANTS[two]) return { key: two, len: 2 };
    const one = s[i];
    if (CONSONANTS[one]) return { key: one, len: 1 };
    return null;
  }

  function lookupPronunciationWord(raw, libraryMap) {
    const exact = exactRomanKey(raw);
    const userMap = userPronunciationMap();
    return userMap.get(exact)
      || userMap.get(stripRomanMarks(raw))
      || userMap.get(romanSpeechKey(raw))
      || AMPS_WORDS.get(exact)
      || AMPS_WORDS.get(stripRomanMarks(raw))
      || AMPS_WORDS.get(romanSpeechKey(raw))
      || libraryMap?.get(exact)
      || "";
  }

  function romanWordToDevanagari(raw, libraryMap) {
    const direct = lookupPronunciationWord(raw, libraryMap);
    if (direct) return direct;
    const normalized = normalizeAmpsRomanPronunciation(raw);
    const fromEngine = transliterateWithEngine(normalized);
    if (fromEngine) return fromEngine;
    let s = normalizeRomanForDevanagari(normalized).replace(/[^a-z']/g, "");
    if (!s || s.length < 3 || !/[aeiour]/.test(s)) return raw;
    let out = "";
    let i = 0;
    while (i < s.length) {
      if (s[i] === "'") {
        out += "ऽ";
        i += 1;
        continue;
      }
      const v = readVowel(s, i);
      if (v) {
        out += VOWELS[v.key].indep;
        i += v.len;
        continue;
      }
      const c = readConsonant(s, i);
      if (!c) {
        out += s[i];
        i += 1;
        continue;
      }
      out += CONSONANTS[c.key];
      i += c.len;
      const nextV = readVowel(s, i);
      if (nextV) {
        out += VOWELS[nextV.key].matra;
        i += nextV.len;
      } else {
        const nextC = readConsonant(s, i);
        if (nextC) out += "्";
      }
    }
    return out;
  }

  function transliterateWithEngine(raw) {
    const L = typeof window !== "undefined" ? window.RomanSamskrtaLib : null;
    if (!L?.transliterateVerse && !L?.transliterate) return "";
    try {
      const text = String(raw || "").trim();
      if (!text) return "";
      const r = L.transliterateVerse
        ? L.transliterateVerse(text, { acceptScholarlyRomanInput: true, banglaBaVa: "b" })
        : L.transliterate(text, "roman-custom", { acceptScholarlyRomanInput: true, banglaBaVa: "b" });
      return String(r?.devanagari || "").trim().replace(/[।॥]+$/g, "");
    } catch (_) {
      return "";
    }
  }

  function shouldConvertRomanWord(word, libraryMap) {
    const clean = String(word || "").replace(/^[^\p{L}\p{M}'’‘`]+|[^\p{L}\p{M}'’‘`]+$/gu, "");
    if (!clean) return false;
    const key = stripRomanMarks(clean);
    if (!/[\u0301\u0330ḿṁṃāáīíūúṛśṣńṇṅṋñṭḍḥḷṝ॒]/iu.test(clean) && ENGLISH_STOP_WORDS.has(key)) return false;
    if (lookupPronunciationWord(clean, libraryMap)) return true;
    if (/[\u0301\u0330ḿṁṃāáīíūúṛśṣńṇṅṋñṭḍḥḷṝ॒]/iu.test(clean)) return true;
    return false;
  }

  function applyAmpsPronunciation(text, libraryMap) {
    let out = String(text || "");
    PHRASE_KEYS.forEach(key => {
      const value = AMPS_WORDS.get(key);
      const parts = key.split(/\s+/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const re = new RegExp(`\\b${parts.join("\\s+")}\\b`, "gi");
      out = out.replace(re, value);
    });
    return out.replace(/([\p{L}\p{M}'’‘`]+(?:-[\p{L}\p{M}'’‘`]+)*)/gu, token => {
      if (hasDevanagari(token) || !shouldConvertRomanWord(token, libraryMap)) return token;
      const prefix = token.match(/^[^\p{L}\p{M}'’‘`]+/u)?.[0] || "";
      const suffix = token.match(/[^\p{L}\p{M}'’‘`]+$/u)?.[0] || "";
      const core = token.slice(prefix.length, token.length - suffix.length);
      return prefix + romanWordToDevanagari(core, libraryMap) + suffix;
    });
  }

  function phoneticRomanWord(raw) {
    const exact = exactRomanKey(raw);
    const marked = exact.normalize("NFD");
    const userSpeech = userSpeechMap();
    const direct = userSpeech.get(exact)
      || userSpeech.get(stripRomanMarks(raw))
      || userSpeech.get(romanSpeechKey(raw))
      || librarySpeechMap?.get(exact)
      || librarySpeechMap?.get(stripRomanMarks(raw))
      || librarySpeechMap?.get(romanSpeechKey(raw))
      || AMPS_SINGLE_VOICE_WORDS.get(exact)
      || AMPS_SINGLE_VOICE_WORDS.get(stripRomanMarks(raw));
    if (direct) return direct;
    const shared = window.RomanSamskrtaLib?.pronounceRomanSamskrtaWord?.(raw);
    if (shared) return shared;
    return normalizeAmpsRomanPronunciation(marked)
      .normalize("NFD")
      .replace(/a\u0301|ā|á/gu, "aa")
      .replace(/i\u0301|ī|í/gu, "ee")
      .replace(/u\u0301|ū|ú/gu, "oo")
      .replace(/m\u0301|ḿ|ṁ|ṃ/gu, "ng")
      .replace(/n\u0330|ṅ|ṇ|ṅ|ḋ|ñ/gu, "n")
      .replace(/s\u0301|ś|ṣ/gu, "sh")
      .replace(/t\u0301|ṭ/gu, "t")
      .replace(/d\u0301|ḍ/gu, "d")
      .replace(/jin?a/giu, "gya")
      .replace(/\bcae/giu, "chai")
      .replace(/\bc(?=[aeiou])/giu, "ch")
      .replace(/ii/giu, "ee")
      .replace(/uu/giu, "oo")
      .replace(/[\u0300-\u036f]/gu, "")
      .replace(/[^A-Za-z' -]/g, "");
  }

  function applyAmpsSingleVoicePronunciation(text, libraryMap) {
    let out = String(text || "");
    AMPS_VERIFIED_PHRASES.forEach(row => { out = out.replace(row.text, row.spoken); });
    SPEECH_PHRASE_KEYS.forEach(key => {
      const value = AMPS_SINGLE_VOICE_WORDS.get(key);
      const parts = key.split(/\s+/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const re = new RegExp(`\\b${parts.join("\\s+")}\\b`, "gi");
      out = out.replace(re, value);
    });
    return out.replace(/([\p{L}\p{M}'’‘`]+(?:-[\p{L}\p{M}'’‘`]+)*)/gu, token => {
      if (hasDevanagari(token) || !shouldConvertRomanWord(token, libraryMap)) return token;
      const prefix = token.match(/^[^\p{L}\p{M}'’‘`]+/u)?.[0] || "";
      const suffix = token.match(/[^\p{L}\p{M}'’‘`]+$/u)?.[0] || "";
      const core = token.slice(prefix.length, token.length - suffix.length);
      return prefix + phoneticRomanWord(core) + suffix;
    });
  }

  function normalizeTtsPunctuationSpacing(text) {
    return String(text || "")
      .replace(/([.!?।॥])(?=[A-Za-zÁĀÍĪÚŪáāíīúūḿṁṃńṇṅṋñśṣṭḍṛḷṝ\u0900-\u097F])/gu, "$1 ")
      .replace(/([,;:])(?=[A-Za-zÁĀÍĪÚŪáāíīúūḿṁṃńṇṅṋñśṣṭḍṛḷṝ\u0900-\u097F])/gu, "$1 ")
      .replace(/\s+([.!?।॥,;:])/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function normalizeTtsAbbreviations(text) {
    return String(text || "")
      .replace(/\bi\s*\.\s*e\s*\./giu, "that is")
      .replace(/\be\s*\.\s*g\s*\./giu, "for example");
  }

  function normalizeTtsSilentPunctuation(text) {
    return String(text || "")
      .replace(/[.!?।॥,;:()[\]{}"“”„‟«»]+/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function isVerseLike(text) {
    const s = String(text || "").trim();
    if (!s) return false;
    if (/[\u0900-\u097F]/.test(s) && s.length < 220) return true;
    if (/\b(mantra|shloka|śloka|śloka|sútra|sutra|namah|svaha|aum|om)\b/i.test(s)) return true;
    if (/^[A-ZÁĀÍĪÚŪŚṢṬḌṆṄÑḾ][^.!?]{8,180}[;:]?\s*$/u.test(s) && /[ḿṁṃāáīíūúṛśṣńṇṅṋñṭḍ́]/iu.test(s)) return true;
    if (
      s.length < 200
      && /[ḿṁṃāáīíūúṛśṣńṇṅṋñṭḍ́]/iu.test(s)
      && !/\b(the|and|is|are|was|were|that|this|with|from|have|has|will|would|should|their|they|you|your|not|but|for|when|where|which|who|what|how|can|may|also|into|than|then|there|here|been|being|does|did|do)\b/i.test(s)
      && !/[.!?।॥].+[.!?।॥]/.test(s)
    ) {
      return true;
    }
    return false;
  }

  function splitSentences(text) {
    const s = normalizeTtsAbbreviations(text).replace(/\s+/g, " ").trim();
    if (!s) return [];
    const parts = [];
    const re = /[^.!?।॥]+[.!?।॥]?["')\]]?/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const chunk = m[0].trim();
      if (chunk) parts.push({ text: chunk, start: m.index });
    }
    return parts.length ? parts : [{ text: s, start: 0 }];
  }

  function readingGroups(text, style) {
    const sentences = splitSentences(text);
    return normalizeReadingStyle(style) === "pravachan"
      ? sentences.flatMap(splitBreathGroups)
      : sentences;
  }

  function splitBreathGroups(seg) {
    const text = String(seg.text || "").trim();
    if (!text) return [];
    const hasClauseBreak = /[,;:]/.test(text);
    if (!hasClauseBreak && text.length <= 150) return [seg];
    const parts = [];
    const re = /[^,;:()]+[,;:]?|\([^)]{1,140}\)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const chunk = m[0].trim();
      if (!chunk) continue;
      if (chunk.length > 170) {
        const words = chunk.split(/\s+/);
        let buf = "";
        let localStart = m.index;
        words.forEach(w => {
          if ((buf + " " + w).trim().length > 120 && buf) {
            parts.push({ text: buf.trim(), start: seg.start + localStart });
            localStart += buf.length + 1;
            buf = w;
          } else {
            buf = (buf ? buf + " " : "") + w;
          }
        });
        if (buf) parts.push({ text: buf.trim(), start: seg.start + localStart });
      } else {
        parts.push({ text: chunk, start: seg.start + m.index });
      }
    }
    return parts.length ? parts : [seg];
  }

  function pauseSettings(opts) {
    const src = opts || {};
    const commaRaw = Number(src.comma);
    const commaVal = Number.isFinite(commaRaw) && commaRaw > 0 ? commaRaw : 160;
    return {
      comma: Math.max(80, Math.min(900, commaVal)),
      sentence: Math.max(180, Math.min(900, Number(src.sentence) || 280)),
      paragraph: Math.max(400, Math.min(2200, Number(src.paragraph) || 600)),
      verseShort: Math.max(700, Math.min(2800, Number(src.verseShort) || 1300)),
      verseLong: Math.max(1000, Math.min(3600, Number(src.verseLong) || 2200)),
      heading: Math.max(700, Math.min(2600, Number(src.heading) || 1300)),
      beforeVerse: Math.max(600, Math.min(2600, Number(src.beforeVerse) || 1100)),
    };
  }

  async function delayBetweenParagraphs(audio, hasMore) {
    if (!audio?.playing || !hasMore) return;
    const pauses = pauseSettings(audio.pauseSettings);
    await delay(pauses.paragraph);
  }

  function pravachanToneFor(text, flags) {
    const s = String(text || "").trim();
    const lower = s.toLowerCase();
    if (flags?.verse) {
      return { tone: "verse", rateMultiplier: 0.86, pitch: 0.86, pauseBeforeAdd: 180, pauseAfterAdd: 260 };
    }
    if (/[?？]$/.test(s)) {
      return { tone: "question", rateMultiplier: 0.94, pitch: 0.94, pauseBeforeAdd: 0, pauseAfterAdd: 20 };
    }
    if (/[!！]$/.test(s) || /\b(must|never|always|do not|don't|should|let us|remember|try to|move on|caraeveti)\b/i.test(s)) {
      return { tone: "emphasis", rateMultiplier: 0.98, pitch: 0.91, pauseBeforeAdd: 0, pauseAfterAdd: 15 };
    }
    if (/\b(lord|baba|guru|parama|puruśa|puruśa|supreme|divine|devotion|bhakti|love|grace|bliss|ánanda|ánanda|shrii|surrender|heart)\b/i.test(lower)) {
      return { tone: "devotional", rateMultiplier: 0.9, pitch: 0.84, pauseBeforeAdd: 15, pauseAfterAdd: 25 };
    }
    if (/\b(mind|consciousness|brahma|citta|aham|mahattattva|realisation|realization|meditation|sádhaná|sadhana|dharma)\b/i.test(lower)) {
      return { tone: "reflective", rateMultiplier: 0.92, pitch: 0.87, pauseBeforeAdd: 10, pauseAfterAdd: 20 };
    }
    return { tone: "plain", rateMultiplier: 0.96, pitch: 0.9, pauseBeforeAdd: 0, pauseAfterAdd: 0 };
  }

  function segmentEndPause(text, pauses) {
    const s = String(text || "").trim();
    if (/[,;:]["')\]]?$/.test(s)) return pauses.comma;
    if (/[.!?।॥]["')\]]?$/.test(s)) return pauses.sentence;
    if (/[—–-]$/.test(s)) return Math.round(pauses.comma * 0.75);
    return Math.round(pauses.comma * 0.5);
  }

  function finalizeParagraphSegmentPauses(segments) {
    const list = Array.isArray(segments) ? segments : [];
    if (!list.length) return list;
    return list.map((seg, i) => (i === list.length - 1 ? { ...seg, pauseAfter: 0 } : seg));
  }

  function segmentPauseAfter(seg, i, groups, pauses, heading) {
    const last = i === groups.length - 1;
    const endPause = segmentEndPause(seg.text, pauses);
    if (isVerseLike(seg.text)) {
      return last ? pauses.verseLong : pauses.verseShort;
    }
    if (heading && last && seg.text.length <= 90) {
      return Math.round(pauses.heading * 0.55);
    }
    return endPause;
  }

  function normalReadingSegments(text, pauseOpts) {
    const raw = normalizeTtsAbbreviations(plainSpeakText(text));
    if (!raw) return [];
    const heading = raw.length <= 90 && !/[.!?।॥]$/.test(raw);
    const groups = readingGroups(raw, "normal");
    const pauses = pauseSettings(pauseOpts);
    return finalizeParagraphSegmentPauses(groups.map((seg, i) => {
      const first = i === 0;
      return {
        text: seg.text,
        offset: seg.start,
        rateMultiplier: 1,
        pitch: 1,
        pauseBefore: first
          ? (isVerseLike(seg.text) ? Math.round(pauses.beforeVerse * 0.45) : heading ? 180 : 0)
          : 0,
        pauseAfter: segmentPauseAfter(seg, i, groups, pauses, heading),
      };
    }));
  }

  function humanReadingSegments(text, pauseOpts) {
    const raw = normalizeTtsAbbreviations(plainSpeakText(text));
    if (!raw) return [];
    const heading = raw.length <= 90 && !/[.!?।॥]$/.test(raw);
    const groups = readingGroups(raw, "pravachan");
    const pauses = pauseSettings(pauseOpts);
    return finalizeParagraphSegmentPauses(groups.map((seg, i) => {
      const first = i === 0;
      const last = i === groups.length - 1;
      const segVerse = isVerseLike(seg.text);
      const tone = pravachanToneFor(seg.text, { verse: segVerse, heading });
      const endPause = segmentEndPause(seg.text, pauses);
      const basePause = segVerse
        ? (last ? pauses.verseLong : pauses.verseShort)
        : heading && last
          ? Math.round(pauses.heading * 0.65)
          : endPause;
      const breathGap = first ? 0 : Math.round(pauses.comma * 0.42);
      return {
        text: seg.text,
        offset: seg.start,
        tone: tone.tone,
        rateMultiplier: Math.min(1, 0.95 + (tone.rateMultiplier - 1) * 0.55),
        pitch: Math.min(1, 0.93 + (tone.pitch - 1) * 0.45),
        pauseBefore: breathGap + (first && segVerse ? Math.round(pauses.beforeVerse * 0.55) : first && heading ? 220 : 0) + Math.round(tone.pauseBeforeAdd * 0.5),
        pauseAfter: basePause + Math.round(tone.pauseAfterAdd * 0.65),
      };
    }));
  }

  // Narrator shaping for one sentence chunk: ease in at a paragraph start, lift
  // questions, settle at the paragraph end, slow down for verses, and breathe
  // between sentences. Small deterministic rate drift avoids a metronome feel.
  function podcastProsody(req, style, pauses, hindi) {
    const text = String(req?.text || "").trim();
    const index = Number(req?.chunkIndex) || 0;
    const count = Math.max(1, Number(req?.chunkCount) || 1);
    const last = index >= count - 1;
    let rate = hindi ? 1 : 0.97;
    let pitch = 1;
    const verse = /^sa/i.test(String(req?.language || "")) || /॥|\n/.test(text);
    if (verse) {
      rate *= 0.9;
      pitch = 0.97;
    } else if (/[?？]["')\]’”]*$/.test(text)) {
      pitch = 1.06;
    } else if (/[!！]["')\]’”]*$/.test(text)) {
      pitch = 1.04;
      rate *= 1.02;
    } else if (last && count > 1) {
      pitch = 0.97;
    }
    if (index === 0) rate *= 0.96;
    rate *= 1 + (((index * 7 + (Number(req?.paragraphIndex) || 0) * 3) % 5) - 2) * 0.01;
    if (style === "pravachan") {
      rate *= 0.92;
      pitch *= 0.95;
    }
    const pauseAfter = last ? 0
      : req?.expectedPause === "sentence" ? pauses.sentence + 180
      : req?.expectedPause === "clause" ? Math.round(pauses.comma * 1.4)
      : req?.expectedPause === "comma" ? pauses.comma
      : 60;
    return { rateMultiplier: rate, pitch, pauseAfter };
  }

  function timedSegmentsForText(text, pauseOpts, style, options) {
    if (options?.chanda && window.AmpsShlokaTts?.chandaReadingSegments) {
      return window.AmpsShlokaTts.chandaReadingSegments(text, pauseOpts);
    }
    return timedReadingSegments(text, pauseOpts, style);
  }

  function timedReadingSegments(text, pauseOpts, style) {
    const mode = normalizeReadingStyle(style);
    if (mode === "pravachan") return pravachanSegments(text, pauseOpts);
    if (mode === "human") return humanReadingSegments(text, pauseOpts);
    return normalReadingSegments(text, pauseOpts);
  }

  function pravachanSegments(text, pauseOpts) {
    const raw = normalizeTtsAbbreviations(plainSpeakText(text));
    if (!raw) return [];
    const heading = raw.length <= 90 && !/[.!?।॥]$/.test(raw);
    const groups = readingGroups(raw, "pravachan");
    const pauses = pauseSettings(pauseOpts);
    return finalizeParagraphSegmentPauses(groups.map((seg, i) => {
      const first = i === 0;
      const last = i === groups.length - 1;
      const segVerse = isVerseLike(seg.text);
      const tone = pravachanToneFor(seg.text, { verse: segVerse, heading });
      const endPause = segmentEndPause(seg.text, pauses);
      const basePause = segVerse
        ? (last ? pauses.verseLong : pauses.verseShort)
        : heading && last
          ? pauses.heading
          : endPause;
      return {
        text: seg.text,
        offset: seg.start,
        tone: tone.tone,
        rateMultiplier: tone.rateMultiplier,
        pitch: tone.pitch,
        pauseBefore: (first ? (segVerse ? pauses.beforeVerse : heading ? 650 : 180) : 0) + tone.pauseBeforeAdd,
        pauseAfter: basePause + tone.pauseAfterAdd,
      };
    }));
  }

  function normalizeEnglishArticleForSpeech(text) {
    // Standard English: /ðə/ before a consonant, /ðiː/ before a vowel or for
    // emphasis. Keep the normal weak article untouched so Android/English TTS
    // does not over-stress it; use a hidden cue only for the long-vowel form.
    return String(text || "")
      .replace(/\bI\b/g, "eye")
      .replace(/\bTHE\b/g, "thee")
      .replace(/\bthe(?=\s+["'‘’“”([{]*[aeiou])/giu, match => match[0] === "T" ? "Thee" : "thee");
  }

  /**
   * Prepare text for speech with language-aware routing.
   * Ordinary English must use the English frontend — never Hindi transliteration
   * or whole-string Samskrta normalisation merely because Sanskrit mode is on.
   */
  async function prepareSpeakText(text, preset, options) {
    let spoken = normalizeTtsAbbreviations(plainSpeakText(text));
    if (!spoken) return "";
    if (!options?.corpusLanguage && isHindiCorpus(sessionCorpusLanguage)) {
      options = { ...options, corpusLanguage: sessionCorpusLanguage };
    }

    // Unified orchestrator path (preferred)
    if (window.TtsOrchestrator?.prepareSpeakRequest && !options?.skipOrchestrator) {
      const routed = await window.TtsOrchestrator.prepareSpeakRequest(spoken, preset, options);
      if (routed?.allEnglish) {
        const en = window.EnglishTtsProcessor?.prepare?.(spoken, { locale: routed.primaryLocale })
          || { text: spoken };
        return normalizeTtsSilentPunctuation(normalizeTtsPunctuationSpacing(en.text));
      }
      if (routed?.segments?.length) {
        const parts = [];
        for (const seg of routed.segments) {
          if (seg.language === "en") {
            parts.push(seg.text);
            continue;
          }
          if (seg.language === "sa-Latn" || seg.language === "sa-Deva") {
            parts.push(seg.text);
            continue;
          }
          if (seg.language === "hi-Deva") {
            parts.push(seg.text);
            continue;
          }
          parts.push(seg.text);
        }
        return normalizeTtsSilentPunctuation(normalizeTtsPunctuationSpacing(parts.join("")));
      }
    }

    const contentLang = String(options?.contentLanguage || options?.language || "").toLowerCase();
    const forceEnglish = contentLang === "en" || contentLang.startsWith("en")
      || options?.pronunciationFrontend === "english";

    if (forceEnglish) {
      const en = window.EnglishTtsProcessor?.prepare?.(spoken)
        || { text: spoken };
      return normalizeTtsSilentPunctuation(normalizeTtsPunctuationSpacing(en.text));
    }

    // Script/metadata fallback classification
    const classified = window.TtsLanguageRouter?.classifyText?.(spoken, {
      explicitLanguage: options?.contentLanguage || options?.language,
      corpusLanguage: options?.corpusLanguage || "en",
      element: options?.element,
    });
    if (classified?.language === "en") {
      const en = window.EnglishTtsProcessor?.prepare?.(spoken) || { text: spoken };
      return normalizeTtsSilentPunctuation(normalizeTtsPunctuationSpacing(en.text));
    }

    const skMode = resolveSanskritSpeechMode(options);
    if (skMode !== "off" && (classified?.language === "sa-Latn" || classified?.language === "sa-Deva")) {
      if (window.AmpsSamskrtaPronunciationAdapter?.prepare) {
        const sk = await window.AmpsSamskrtaPronunciationAdapter.prepare(spoken, {
          language: classified.language,
          pronunciationMode: skMode,
        });
        return normalizeTtsSilentPunctuation(normalizeTtsPunctuationSpacing(sk.text || spoken));
      }
      if (window.AmpsSanskritTts?.normalizeForSpeech) {
        await loadLibraryPronunciationMap();
        spoken = await window.AmpsSanskritTts.normalizeForSpeech(spoken, skMode, {
          librarySpeechMap: librarySpeechMap || undefined,
        });
        spoken = window.AmpsSanskritTts.formatPauseForTTS?.(spoken) || spoken;
      }
      return normalizeTtsSilentPunctuation(normalizeTtsPunctuationSpacing(spoken));
    }

    // Hindi Devanagari only when content is actually Hindi/Devanagari — never convert English.
    if (skMode !== "off" && isHindiPreset(preset) && classified?.language === "hi-Deva") {
      const map = await loadLibraryPronunciationMap();
      spoken = applyAmpsPronunciation(spoken, map);
      return normalizeTtsSilentPunctuation(normalizeTtsPunctuationSpacing(spoken));
    }

    // Default: leave English (and unmarked Roman prose) alone
    return normalizeTtsSilentPunctuation(normalizeTtsPunctuationSpacing(spoken));
  }

  async function prepareApiSegments(text, preset, options) {
    const style = normalizeReadingStyle(options?.readingStyle);
    const mode = normalizePronunciationMode(options?.pronunciationMode);
    const base = timedSegmentsForText(text, options?.pauseSettings, style, { chanda: !!options?.chanda });
    const prepared = [];
    for (const seg of base) {
      const spoken = await prepareSpeakText(seg.text, preset, {
        pronunciationMode: mode,
        readingStyle: style,
      });
      if (!spoken) continue;
      prepared.push({
        ...seg,
        text: spoken,
        originalText: seg.text,
      });
    }
    return prepared;
  }

  function isMostlyLatinText(text) {
    const s = String(text || "");
    const latin = (s.match(/[A-Za-z]/g) || []).length;
    const dev = (s.match(/[\u0900-\u097F]/g) || []).length;
    return latin > 0 && latin > dev * 2;
  }

  function presetForSpeechText(text, preset) {
    const p = normalizePreset(preset);
    if (isHindiPreset(p) && isMostlyLatinText(text)) {
      return genderFromPreset(p) === "male" ? "in-en-male" : "in-en-female";
    }
    return p;
  }

  function scriptPresetForChunk(text, basePreset) {
    const s = String(text || "");
    const dev = (s.match(/[\u0900-\u097F]/g) || []).length;
    const latin = (s.match(/[A-Za-z]/g) || []).length;
    if (dev >= 2 && dev >= latin) return genderFromPreset(basePreset) === "male" ? "hi-male" : "hi-female";
    if (latin >= 4 && latin > dev * 2) return genderFromPreset(basePreset) === "male" ? "in-en-male" : "in-en-female";
    return basePreset;
  }

  function tokenScript(token) {
    const s = String(token || "");
    if (!s.trim()) return "space";
    if (/[\u0900-\u097F]/.test(s)) return "dev";
    if (/[A-Za-z]/.test(s)) return "latin";
    return "punct";
  }

  function presetForScript(script, basePreset) {
    if (script === "dev") return genderFromPreset(basePreset) === "male" ? "hi-male" : "hi-female";
    if (script === "latin") return genderFromPreset(basePreset) === "male" ? "in-en-male" : "in-en-female";
    return basePreset;
  }

  function speechChunks(text, basePreset) {
    const s = String(text || "").trim();
    if (!s) return [];
    const pieces = [];
    const re = /[\u0900-\u097F]+|[A-Za-z][A-Za-z'’.-]*|\s+|[^\sA-Za-z\u0900-\u097F]+/g;
    let m;
    let pendingSpace = "";
    let pendingPunct = "";
    while ((m = re.exec(s)) !== null) {
      const raw = m[0];
      const script = tokenScript(raw);
      if (script === "space") {
        pendingSpace += raw;
        continue;
      }
      if (script === "punct") {
        if (pieces.length) pieces[pieces.length - 1].text += raw;
        else pendingPunct += raw;
        continue;
      }
      const prefix = pendingPunct + (pieces.length ? pendingSpace : "");
      const chunk = prefix + raw;
      const preset = presetForScript(script, basePreset);
      pendingSpace = "";
      pendingPunct = "";
      const last = pieces[pieces.length - 1];
      if (last && last.preset === preset && (last.text.length + chunk.length) < 260) {
        last.text += chunk;
      } else {
        pieces.push({ text: chunk.trimStart(), start: Math.max(0, m.index - prefix.length), preset });
      }
    }
    if (pendingPunct && pieces.length) pieces[pieces.length - 1].text += pendingPunct;
    return pieces.length > 1 ? pieces : [];
  }

  function voiceNameFromPreset(preset) {
    const p = normalizePreset(preset);
    if (p.startsWith("voice:")) return p.slice(6);
    return null;
  }

  function effectiveRate(rate, preset) {
    const r = rate || 1;
    return isHindiPreset(preset) ? Math.max(0.75, r * 0.92) : r;
  }

  function isEnIn(v) {
    return /^en[-_]IN\b/i.test(v.lang) || /\b(en-in|rishi|veena|lekha|neel|india)\b/i.test(v.name);
  }

  function isHiIn(v) {
    return /^hi[-_]IN\b/i.test(v.lang) || /^hi\b/i.test(v.lang);
  }

  function isEn(v) {
    return /^en(-|_)/i.test(v.lang) || v.lang === "en";
  }

  function isFemaleVoice(v) {
    const n = String(v.name || "").toLowerCase();
    if (/male|man|\bhid\b|pnc|heera|\-m\b/.test(n)) return false;
    return /female|woman|hia|kajal|leda|samantha|victoria|karen|moira|tessa|fiona|zira|susan|kate|serena|veena|lekha|neel|priya|aditi/i.test(n);
  }

  function isMaleVoice(v) {
    const n = String(v.name || "").toLowerCase();
    if (/female|woman|hia|kajal|leda|veena|lekha|priya|aditi/.test(n)) return false;
    return /male|man|daniel|alex|fred|tom|david|james|rishi|aaron|arjun|rahul|\bhid\b|pnc|heera|\-m\b/.test(n);
  }

  function pickByGender(pool, gender) {
    if (!pool.length) return null;
    if (gender === "male") {
      return pool.find(isMaleVoice) || pool.find(v => !isFemaleVoice(v)) || pool[0];
    }
    return pool.find(isFemaleVoice) || pool.find(v => !isMaleVoice(v)) || pool[0];
  }

  function plainSpeakText(text) {
    let out = String(text || "")
      .replace(/<[^>]+>/g, " ");
    if (window.AmpsTtsNumbers?.normalizeGroupedNumbers) {
      out = window.AmpsTtsNumbers.normalizeGroupedNumbers(out);
    }
    out = out
      .replace(/\bi\s*\.\s*e\s*\./giu, "that is")
      .replace(/\be\s*\.\s*g\s*\./giu, "for example")
      .replace(/\s+/g, " ")
      .trim();
    if (window.AmpsProductivity?.filterTtsText) {
      out = window.AmpsProductivity.filterTtsText(out);
    }
    return out;
  }

  function langFromPreset(preset) {
    const p = normalizePreset(preset);
    if (p === "hi-female" || p === "hi-male" || p === "hi") return "hi-IN";
    if (p === "in-en-female" || p === "in-en-male") return "en-IN";
    if (p === "en-female" || p === "en-male") return "en-GB";
    if (p.startsWith("voice:")) {
      const uri = p.slice(6).toLowerCase();
      if (/^hi[-_]/.test(uri) || uri.includes("hindi")) return "hi-IN";
      if (/en[-_]in/.test(uri)) return "en-IN";
    }
    return "en-IN";
  }

  let _nativeVoicesCache = null;

  async function loadNativeVoices() {
    if (_nativeVoicesCache) return _nativeVoicesCache;
    try {
      const plugin = getNativeTts();
      const res = await plugin?.getVoices?.();
      _nativeVoicesCache = res?.voices || [];
    } catch (_) {
      _nativeVoicesCache = [];
    }
    return _nativeVoicesCache;
  }

  function tokenizeWords(text) {
    const plain = plainSpeakText(text);
    const tokens = [];
    const re = /\S+|\s+/g;
    let m;
    while ((m = re.exec(plain)) !== null) {
      tokens.push({
        text: m[0],
        start: m.index,
        end: m.index + m[0].length,
        isWord: !/^\s+$/.test(m[0]),
      });
    }
    return { plain, tokens };
  }

  function charIndexToWordIndex(text, charIndex) {
    const { tokens } = tokenizeWords(text);
    let wi = -1;
    for (const t of tokens) {
      if (!t.isWord) continue;
      wi += 1;
      if (charIndex >= t.start && charIndex < t.end) return wi;
      if (charIndex < t.start) return Math.max(0, wi);
    }
    return Math.max(0, wi);
  }

  function wordIndexToCharIndex(text, wordIndex) {
    const words = tokenizeWords(text).tokens.filter(t => t.isWord);
    if (!words.length) return 0;
    const wi = Math.max(0, Math.min(words.length - 1, Number(wordIndex) || 0));
    return words[wi].start;
  }

  function spokenStartToOriginalWordIndex(spokenText, spokenStart, baseWordIndex) {
    return Math.max(0, Number(baseWordIndex) || 0)
      + Math.max(0, charIndexToWordIndex(spokenText, spokenStart));
  }

  /** Fold a token for spoken↔display alignment (diacritics / punct stripped). */
  function wordAlignKey(word) {
    return String(word || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\u0900-\u097f]+/giu, "");
  }

  /**
   * Map each spoken word index → original (display) word index.
   * Pronunciation rewrites can change word counts; without this, karaoke drifts.
   */
  function buildSpokenToOriginalWordMap(originalText, spokenText) {
    const orig = tokenizeWords(originalText).tokens.filter(t => t.isWord);
    const spoken = tokenizeWords(spokenText).tokens.filter(t => t.isWord);
    const n = orig.length;
    const m = spoken.length;
    if (!m) return [];
    if (!n) return Array.from({ length: m }, () => 0);
    if (n === m) return Array.from({ length: m }, (_, i) => i);

    const ok = orig.map(t => wordAlignKey(t.text));
    const sk = spoken.map(t => wordAlignKey(t.text));
    const GAP = -1;
    const S = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    const P = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
    for (let i = 1; i <= n; i += 1) {
      S[i][0] = GAP * i;
      P[i][0] = 1;
    }
    for (let j = 1; j <= m; j += 1) {
      S[0][j] = GAP * j;
      P[0][j] = 2;
    }
    const matchScore = (i, j) => {
      const a = ok[i - 1];
      const b = sk[j - 1];
      if (!a || !b) return -0.5;
      if (a === b) return 3;
      if (a.startsWith(b) || b.startsWith(a)) return 2;
      if (a[0] === b[0] && a.length > 2 && b.length > 2) return 1;
      return -1;
    };
    for (let i = 1; i <= n; i += 1) {
      for (let j = 1; j <= m; j += 1) {
        const diag = S[i - 1][j - 1] + matchScore(i, j);
        const up = S[i - 1][j] + GAP;
        const left = S[i][j - 1] + GAP;
        if (diag >= up && diag >= left) {
          S[i][j] = diag;
          P[i][j] = 0;
        } else if (up >= left) {
          S[i][j] = up;
          P[i][j] = 1;
        } else {
          S[i][j] = left;
          P[i][j] = 2;
        }
      }
    }

    const map = new Array(m);
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && P[i][j] === 0) {
        map[j - 1] = i - 1;
        i -= 1;
        j -= 1;
      } else if (i > 0 && (j === 0 || P[i][j] === 1)) {
        i -= 1;
      } else if (j > 0) {
        map[j - 1] = Math.max(0, i - 1);
        j -= 1;
      } else {
        break;
      }
    }
    let last = 0;
    for (let j2 = 0; j2 < m; j2 += 1) {
      if (typeof map[j2] !== "number" || map[j2] < 0) map[j2] = last;
      else last = map[j2];
    }
    return map;
  }

  /**
   * Keeps display highlight locked to the word currently being spoken.
   * Uses engine charIndex when trustworthy; otherwise advances sequentially.
   */
  function createWordSync(opts) {
    const fullText = opts.fullText || "";
    const segmentText = opts.segmentText || fullText;
    const spokenText = opts.spokenText || "";
    const baseWordIndex = Math.max(0, Number(opts.baseWordIndex) || 0);
    const paraIndex = opts.paraIndex;
    const onWord = opts.onWord;
    const map = buildSpokenToOriginalWordMap(segmentText, spokenText);
    const spokenWords = tokenizeWords(spokenText).tokens.filter(t => t.isWord);
    let nextSpoken = 0;
    let lastOrig = -1;
    let lastSpokenEmitted = -1;

    function emitSpokenIndex(spokenIdx) {
      if (!onWord || !spokenWords.length) return false;
      const idx = Math.max(0, Math.min(spokenWords.length - 1, spokenIdx));
      if (idx <= lastSpokenEmitted) return false;
      const localOrig = map[idx] != null ? map[idx] : idx;
      const wordIndex = baseWordIndex + Math.max(0, localOrig);
      if (wordIndex < lastOrig) return false;
      lastSpokenEmitted = idx;
      lastOrig = wordIndex;
      onWord(wordIndexToCharIndex(fullText, wordIndex), paraIndex, wordIndex);
      return true;
    }

    return {
      map,
      spokenWordCount: spokenWords.length,
      /** Engine reported a spoken-string character range. */
      fromCharIndex(charStart, spokenWordIndex) {
        let spokenIdx;
        if (Number.isFinite(spokenWordIndex) && spokenWordIndex >= 0) {
          spokenIdx = spokenWordIndex;
        } else if (Number.isFinite(charStart) && charStart >= 0) {
          spokenIdx = charIndexToWordIndex(spokenText, charStart);
        } else {
          spokenIdx = nextSpoken;
        }
        if (spokenIdx < nextSpoken && spokenIdx <= lastSpokenEmitted) return false;
        const ok = emitSpokenIndex(spokenIdx);
        nextSpoken = Math.max(nextSpoken, spokenIdx + 1);
        return ok;
      },
      /** Boundary without reliable charIndex (count each word event). */
      fromBoundary() {
        if (nextSpoken >= spokenWords.length) return false;
        const ok = emitSpokenIndex(nextSpoken);
        nextSpoken += 1;
        return ok;
      },
      reset() {
        nextSpoken = 0;
        lastOrig = -1;
        lastSpokenEmitted = -1;
      },
    };
  }

  function wordSpanHtml(text, escFn) {
    const esc = escFn || (s => s);
    const { tokens } = tokenizeWords(text);
    let wi = 0;
    return tokens.map(t => {
      if (!t.isWord) return t.text;
      const out = `<span class="tts-word" data-wi="${wi}">${esc(t.text)}</span>`;
      wi += 1;
      return out;
    }).join("");
  }

  function findScrollContainer(el) {
    let node = el?.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      const oy = style.overflowY;
      if (/(auto|scroll|overlay)/.test(oy) && node.scrollHeight > node.clientHeight + 2) {
        return node;
      }
      node = node.parentElement;
    }
    return document.documentElement;
  }

  function smoothScrollWordIntoView(el) {
    if (!el || typeof window === "undefined") return;
    const scroller = findScrollContainer(el);
    const isDoc = scroller === document.documentElement || scroller === document.body;
    const viewRect = isDoc
      ? { top: 0, height: window.innerHeight }
      : scroller.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const wordMid = rect.top + rect.height * 0.5;
    const targetLine = viewRect.top + viewRect.height * 0.34;
    const upper = viewRect.top + viewRect.height * 0.2;
    const lower = viewRect.top + viewRect.height * 0.5;
    if (wordMid >= upper && wordMid <= lower) return;
    const delta = wordMid - targetLine;
    if (Math.abs(delta) < 6) return;
    const nextTop = (isDoc ? window.scrollY : scroller.scrollTop) + delta;
    const opts = { top: Math.max(0, nextTop), behavior: "smooth" };
    if (isDoc) window.scrollTo(opts);
    else scroller.scrollTo(opts);
  }

  function wordCountIn(text) {
    const m = plainSpeakText(text).match(/\S+/g);
    return m ? m.length : 0;
  }

  /** Word-span index range [first, end) covered by text.slice(start, stop). */
  function wordRangeForSlice(text, start, stop) {
    const s = String(text || "");
    const a = Math.max(0, Math.min(s.length, Number(start) || 0));
    const b = Math.max(a, Math.min(s.length, Number(stop) || 0));
    let first = wordCountIn(s.slice(0, a));
    if (a > 0 && /\S/.test(s[a - 1]) && /\S/.test(s[a] || "")) first = Math.max(0, first - 1);
    return { first, end: first + Math.max(1, wordCountIn(s.slice(a, b))) };
  }

  /** Widen [start, stop) to the enclosing sentence(s) of text. */
  function sentenceBounds(text, start, stop) {
    const s = String(text || "");
    const re = /[.!?।॥]+["')\]’”]*(?:\s+|$)/g;
    let a = 0;
    let b = s.length;
    let m;
    while ((m = re.exec(s)) !== null) {
      const end = m.index + m[0].length;
      if (end <= start) a = end;
      else if (end >= stop) {
        b = end;
        break;
      }
    }
    return [a, b];
  }

  /** Wrap word spans [first, end) in one band so the highlight also covers the spaces. */
  function highlightSentenceIn(container, first, end) {
    if (typeof document === "undefined") return;
    document.querySelectorAll(".tts-sentence-active").forEach(band => band.replaceWith(...band.childNodes));
    if (!container || !(end > first)) return;
    const startEl = container.querySelector(`.tts-word[data-wi="${first}"]`);
    let lastEl = null;
    for (let wi = end - 1; wi >= first && !lastEl; wi -= 1) {
      lastEl = container.querySelector(`.tts-word[data-wi="${wi}"]`);
    }
    if (!startEl || !lastEl || startEl.parentNode !== lastEl.parentNode) return;
    try {
      const range = document.createRange();
      range.setStartBefore(startEl);
      range.setEndAfter(lastEl);
      const band = document.createElement("span");
      band.className = "tts-sentence-active";
      band.appendChild(range.extractContents());
      range.insertNode(band);
    } catch (_) { /* leave the word highlight only */ }
  }

  function highlightWordIn(container, wordIndex) {
    if (!container) return;
    container.querySelector(".tts-word-active")?.classList.remove("tts-word-active");
    if (wordIndex < 0) return;
    const el = container.querySelector(`.tts-word[data-wi="${wordIndex}"]`);
    if (el) {
      el.classList.add("tts-word-active");
      smoothScrollWordIntoView(el);
    }
  }

  function isCapacitorAndroid() {
    try {
      const cap = window.Capacitor;
      return cap?.isNativePlatform?.() && cap.getPlatform?.() === "android";
    } catch (_) {
      return false;
    }
  }

  let _ampsTtsPlugin = null;

  function getNativeTts() {
    try {
      if (!isCapacitorAndroid()) return null;
      const cap = window.Capacitor;
      if (!_ampsTtsPlugin && cap.registerPlugin) {
        _ampsTtsPlugin = cap.registerPlugin("AmpsTts");
      }
      return _ampsTtsPlugin || cap.Plugins?.AmpsTts || null;
    } catch (_) {
      return null;
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  const AudioSync = {
    synth: typeof window !== "undefined" ? window.speechSynthesis : null,
    playing: false,
    paragraphs: [],
    paraIds: [],
    idx: 0,
    rate: 1,
    voicePreset: "in-en-female",
    sessionBrowserVoice: null,
    pronunciationMode: "normal",
    readingStyle: "normal",
    startOffset: 0,
    startIdx: 0,
    paused: false,
    onHighlight: null,
    onWord: null,
    spokenText: "",
    timer: null,
    voicesReady: false,
    _voiceListeners: [],
    _primed: false,
    _nativeRangeListener: null,
    _wordFallbackTimer: null,
    _utteranceEndReason: null,
    _platformHints: null,
    _activeUtteranceToken: null,

    useNative() {
      return !!getNativeTts();
    },

    stop(reason) {
      this._utteranceEndReason = reason
        || (window.TtsPlaybackSession?.END_REASON?.user_stop || "user_stop");
      this.playing = false;
      this.paused = false;
      this.sessionBrowserVoice = null;
      try { window.TtsQueueController?.stop?.(this._utteranceEndReason); } catch (_) { /* */ }
      window.AmpsApiTts?.stop?.();
      this.synth?.cancel();
      try {
        const native = getNativeTts();
        if (native?.stop) native.stop().catch?.(() => {});
      } catch (_) { /* */ }
      if (this._nativeRangeListener) {
        try { this._nativeRangeListener.remove(); } catch (_) { /* */ }
        this._nativeRangeListener = null;
      }
      if (this._wordFallbackTimer) {
        clearTimeout(this._wordFallbackTimer);
        clearInterval(this._wordFallbackTimer);
        this._wordFallbackTimer = null;
      }
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      // A replacing session installs its own handler; telling the old one that
      // reading ended would switch the reader's audio controls off mid-playback.
      const endedHandler = this.onHighlight;
      this.onHighlight = null;
      const replaced = this._utteranceEndReason === (window.TtsPlaybackSession?.END_REASON?.replacement || "replacement");
      if (endedHandler && !replaced) endedHandler(-1);
      this.onWord = null;
      this._sentenceToken = (this._sentenceToken || 0) + 1;
      highlightSentenceIn(null, 0, 0);
      try { window.TtsHighlightController?.clearAll?.(); } catch (_) { /* */ }
    },

    pause() {
      if (!this.playing) return false;
      this.paused = true;
      try { window.TtsQueueController?.pause?.(); } catch (_) { /* */ }
      try {
        if (this.synth?.speaking && !this.synth.paused) this.synth.pause();
      } catch (_) { /* */ }
      return true;
    },

    resume() {
      if (!this.playing) return false;
      this.paused = false;
      try { window.TtsQueueController?.resume?.(); } catch (_) { /* */ }
      try {
        if (this.synth?.paused) this.synth.resume();
      } catch (_) { /* */ }
      return true;
    },

    async _waitWhilePaused() {
      while (this.playing && this.paused) await delay(120);
    },

    _clearWordFallback() {
      if (this._wordFallbackTimer) {
        clearTimeout(this._wordFallbackTimer);
        clearInterval(this._wordFallbackTimer);
        this._wordFallbackTimer = null;
      }
    },

    _startWordFallback(spoken, rate, onWord, wordSync) {
      // Never use estimated WPM word highlighting unless the platform registry
      // confirms reliable boundary-aligned word sync. Prefer chunk/phrase highlight.
      const hints = this._platformHints || {};
      if (window.TtsPlatformCapabilities && !window.TtsPlatformCapabilities.wordHighlightAllowed(hints)) {
        return;
      }
      this._clearWordFallback();
      const words = tokenizeWords(spoken).tokens.filter(t => t.isWord);
      if (!words.length || !onWord) return;
      const charsPerSec = Math.max(8, 13.5 * (Number(rate) || 1));
      let fi = 0;
      const step = () => {
        if (!this.playing || this.paused || fi >= words.length) {
          this._clearWordFallback();
          return;
        }
        if (wordSync) wordSync.fromCharIndex(words[fi].start, fi);
        else onWord(words[fi].start, words[fi].end, fi);
        fi += 1;
        if (fi >= words.length) {
          this._clearWordFallback();
          return;
        }
        const prev = words[fi - 1];
        const cur = words[fi];
        const span = Math.max(1, (cur.start + cur.text.length) - prev.start);
        const ms = Math.max(85, (span / charsPerSec) * 1000);
        this._wordFallbackTimer = setTimeout(step, ms);
      };
      this._wordFallbackTimer = setTimeout(step, 70);
    },

    /**
     * Highlight the sentence containing a queue chunk and return a mapper from
     * engine char positions (in the spoken chunk) to paragraph word spans.
     */
    _followChunk(req) {
      const localIdx = Number(req?.paragraphIndex) || 0;
      const pi = (this.startIdx || 0) + localIdx;
      const paraText = String(this.paragraphs?.[pi] || "");
      const base = localIdx === 0 ? Math.min(this.startOffset || 0, paraText.length) : 0;
      const visible = String(req?.text || "");
      const chunkStart = base + (Number(req?.canonicalStart) || 0);
      const chunkEnd = Number.isFinite(req?.canonicalEnd) ? base + req.canonicalEnd : chunkStart + visible.length;
      const range = wordRangeForSlice(paraText, chunkStart, chunkEnd);
      const [sentStart, sentEnd] = sentenceBounds(paraText, chunkStart, chunkEnd);
      const sentence = wordRangeForSlice(paraText, sentStart, sentEnd);
      const token = (this._sentenceToken = (this._sentenceToken || 0) + 1);
      const id = this.paraIds?.[pi];
      const mark = (tries) => {
        if (!this.playing || token !== this._sentenceToken || typeof document === "undefined") return;
        const el = id ? document.getElementById(id) : null;
        const block = el?.querySelector(".para-text") || el;
        if (block?.querySelector(".tts-word")) {
          highlightSentenceIn(block, sentence.first, sentence.end);
          return;
        }
        // Word spans appear once the reader renders the paragraph (page mode renders late).
        if (tries > 0) setTimeout(() => mark(tries - 1), 150);
      };
      mark(8);
      const spoken = String(req?.processedText || visible);
      const spokenWords = Math.max(1, wordCountIn(spoken));
      const visibleWords = range.end - range.first;
      return (charIndex) => {
        if (!this.playing || token !== this._sentenceToken || !this.onWord) return;
        const local = charIndexToWordIndex(spoken, Number(charIndex) || 0);
        const scaled = spokenWords === visibleWords ? local : Math.floor((local * visibleWords) / spokenWords);
        const wi = Math.min(range.end - 1, range.first + Math.max(0, scaled));
        this.onWord(chunkStart, pi, wi);
      };
    },

    _startSegmentWordFallback(seg, rate, onWord) {
      this._startWordFallback(seg.text, rate, (start, end, wi) => {
        onWord(seg.offset + start, seg.offset + end, wi);
      });
    },

    resumeSynth() {
      if (this.synth?.paused) {
        try { this.synth.resume(); } catch (_) { /* */ }
      }
    },

    prime() {
      if (this.useNative()) {
        try { getNativeTts(); } catch (_) { /* */ }
        return;
      }
      if (!this.synth || this._primed) return;
      this._primed = true;
      this.initVoices();
      this.synth.getVoices();
      this.resumeSynth();
    },

    initVoices() {
      if (!this.synth) return;
      const load = () => {
        const ready = !!this.synth.getVoices().length;
        if (ready !== this.voicesReady) {
          this.voicesReady = ready;
          this._voiceListeners.forEach(fn => { try { fn(); } catch (_) { /* */ } });
        }
      };
      load();
      if (!this._voicesBound) {
        this._voicesBound = true;
        this.synth.addEventListener("voiceschanged", load);
      }
    },

    onVoicesReady(fn) {
      if (this.useNative()) { fn(); return; }
      this.initVoices();
      if (this.voicesReady) fn();
      else this._voiceListeners.push(fn);
    },

    waitForVoices(timeoutMs) {
      if (this.useNative()) return Promise.resolve([]);
      this.initVoices();
      const voices = this.synth?.getVoices?.() || [];
      if (voices.length) return Promise.resolve(voices);
      return new Promise(resolve => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          this.synth?.removeEventListener("voiceschanged", onChange);
          resolve(this.synth?.getVoices?.() || []);
        };
        const onChange = () => {
          if (this.synth?.getVoices?.().length) finish();
        };
        const timer = setTimeout(finish, timeoutMs || 1500);
        this.synth?.addEventListener("voiceschanged", onChange);
      });
    },

    getVoices() {
      if (this.useNative()) return [];
      this.initVoices();
      return this.synth?.getVoices?.() || [];
    },

    getPresetOptions() {
      return PRESETS.filter(p => p.value !== "hi");
    },

    async getVoiceSelectOptions() {
      const options = this.getPresetOptions().map(p => ({ value: p.value, label: p.label, group: "preset" }));
      if (this.useNative()) {
        const voices = await loadNativeVoices();
        voices.forEach(v => {
          const lang = String(v.lang || "").toLowerCase();
          const name = String(v.name || "");
          const key = "voice:" + name;
          if (options.some(o => o.value === key)) return;
          if (lang.startsWith("en-in") || (lang.startsWith("en") && lang.includes("in"))) {
            options.push({ value: key, label: name + " (" + v.lang + ")", group: "device" });
          } else if (lang.startsWith("hi")) {
            options.push({ value: key, label: name + " (" + v.lang + ")", group: "hindi" });
          }
        });
        return options;
      }
      const voices = this.getVoices();
      voices.filter(isEnIn).forEach(v => {
        const key = "voice:" + v.voiceURI;
        if (!options.some(o => o.value === key)) {
          options.push({ value: key, label: v.name + " (" + v.lang + ")", group: "device" });
        }
      });
      voices.filter(isHiIn).forEach(v => {
        const key = "voice:" + v.voiceURI;
        if (!options.some(o => o.value === key)) {
          options.push({ value: key, label: v.name + " (" + v.lang + ")", group: "hindi" });
        }
      });
      return options;
    },

    hasIndianEnglishVoice() {
      if (this.useNative()) return true;
      return this.getVoices().some(isEnIn);
    },

    presetHint(preset) {
      const p = normalizePreset(preset);
      if (this.useNative()) {
        if (isHindiPreset(p)) {
          return "Hindi voice is used for Hindi/Devanagari passages. English prose is kept in English and routed to an English voice where possible.";
        }
        return "Using your phone's built-in text-to-speech engine.";
      }
      if (p === "default") return "";
      if (p.startsWith("voice:")) return "";
      if ((p === "in-en-female" || p === "in-en-male") && !this.hasIndianEnglishVoice()) {
        return "No Indian English voice detected on this device. Install one in Settings → Accessibility → Text-to-speech, or pick a device voice below.";
      }
      if (isHindiPreset(p) && !this.getVoices().some(isHiIn)) {
        return "No Hindi voice detected. Install Hindi TTS in device settings.";
      }
      if (isHindiPreset(p)) {
        return "English passages stay in English; Hindi/Devanagari passages use Hindi voice when available.";
      }
      return "";
    },

    pickVoice(preset, options) {
      const p = normalizePreset(preset);
      if (p === "default") return null;
      const voices = this.getVoices();
      if (!voices.length) return null;

      const contentLang = String(
        options?.contentLanguage || options?.language || options?.pronunciationFrontend || ""
      ).toLowerCase();
      const wantEnglish = contentLang === "en"
        || contentLang.startsWith("en")
        || contentLang === "english"
        || options?.forceEnglishVoice === true;
      const wantSamskrta = contentLang === "sa-latn"
        || contentLang === "sa-deva"
        || contentLang === "sa"
        || options?.pronunciationFrontend === "amps-samskrta";
      const wantHindi = contentLang === "hi"
        || contentLang.startsWith("hi")
        || contentLang === "hi-deva";

      // Voice identity ≠ language frontend: English content never uses Hindi voices.
      if (wantEnglish) {
        const enVoice = pickVoiceForEnglish(voices, p);
        if (enVoice) return enVoice;
      }
      if (wantSamskrta && !p.startsWith("voice:")) {
        const skVoice = pickVoiceForSanskrit(voices, p);
        if (skVoice) return skVoice;
      }

      if (p.startsWith("voice:")) {
        const uri = p.slice(6);
        const found = voices.find(v => v.voiceURI === uri) || null;
        // Guard: explicit device Hindi voice must not serve English requests
        if (found && wantEnglish && isHiIn(found) && !isEn(found)) {
          return pickVoiceForEnglish(voices, "in-en-female") || found;
        }
        return found;
      }
      if (p === "hi-female" || p === "hi-male" || p === "hi") {
        // Hindi preset for English prose → remap to Indian English of same gender
        if (wantEnglish || (!wantHindi && !wantSamskrta && options?.routedEnglish !== false
          && window.TtsLanguageRouter?.classifyText?.(options?.sampleText || "")?.language === "en")) {
          const gender = genderFromPreset(p);
          return pickVoiceForEnglish(voices, gender === "male" ? "in-en-male" : "in-en-female");
        }
        if (p === "hi") return voices.filter(isHiIn)[0] || null;
        const gender = p === "hi-male" ? "male" : "female";
        const hiVoices = voices.filter(isHiIn);
        if (gender === "male") {
          const explicit = hiVoices.find(v => /\bhid\b|pnc|heera|\-m\b|male/i.test(v.name) && !/female|hia|kajal|leda/i.test(v.name));
          if (explicit) return explicit;
        }
        return pickByGender(hiVoices, gender) || hiVoices[0] || null;
      }
      if (p === "in-en-female" || p === "in-en-male") {
        const gender = p === "in-en-male" ? "male" : "female";
        const inEn = voices.filter(isEnIn);
        const picked = pickByGender(inEn, gender);
        if (picked) return picked;
        return pickByGender(voices.filter(isEn).length ? voices.filter(isEn) : voices, gender);
      }
      if (p === "en-female" || p === "en-male") {
        const en = voices.filter(v => isEn(v) && !isEnIn(v));
        const pool = en.length ? en : voices.filter(isEn);
        return pickByGender(pool.length ? pool : voices, p === "en-male" ? "male" : "female");
      }
      return pickByGender(voices.filter(isEn).length ? voices.filter(isEn) : voices, "female");
    },

    async speakNative(spoken, rate, preset, onWord, options) {
      const plugin = getNativeTts();
      const text = String(spoken || "").trim();
      if (!plugin || !text) return false;
      const wordSync = options?.wordSync || null;
      const chunks = options?.allowChunks === false ? [] : speechChunks(text, normalizePreset(preset));
      if (chunks.length > 1) {
        for (const chunk of chunks) {
          if (!this.playing) return false;
            const ok = await this.speakNative(
            chunk.text,
            rate,
            chunk.preset,
            onWord ? (start, end, wi) => {
              if (wordSync) wordSync.fromCharIndex(chunk.start + start, null);
              else onWord(chunk.start + start, chunk.start + end, wi);
            } : null,
            { ...options, allowChunks: false, wordSync: null }
          );
          if (!ok) return false;
          // The TTS completion callback already gives a natural boundary. An
          // extra delay here made mixed-script sentences sound interrupted.
        }
        return true;
      }
      const speechPreset = presetForSpeechText(text, preset);
      let lang = langFromPreset(speechPreset);
      if (options?.contentLanguage === "en" || options?.forceEnglishLang) {
        lang = window.EnglishTtsProcessor?.resolveLocale?.([lang, "en-IN", "en-GB", "en-US"]) || "en-IN";
        if (!/^en/i.test(lang)) lang = "en-IN";
      }
      const gender = genderFromPreset(speechPreset);
      const voiceName = speechPreset === normalizePreset(preset) ? voiceNameFromPreset(preset) : null;
      const speechRate = effectiveRate(rate, speechPreset);
      const pitch = options?.pitch || 1;
      let gotRange = false;
      if (onWord || wordSync) {
        try {
          if (this._nativeRangeListener) {
            try { this._nativeRangeListener.remove(); } catch (_) { /* */ }
          }
          this._nativeRangeListener = await plugin.addListener("rangeStart", ev => {
            gotRange = true;
            this._clearWordFallback();
            if (wordSync) {
              wordSync.fromCharIndex(ev.start, charIndexToWordIndex(text, ev.start));
            } else if (onWord) {
              onWord(ev.start, ev.end, charIndexToWordIndex(text, ev.start));
            }
          });
        } catch (_) { /* */ }
        setTimeout(() => {
          if (!gotRange && this.playing) {
            this._startWordFallback(text, speechRate, onWord || ((s, e, wi) => wordSync?.fromCharIndex(s, wi)), wordSync);
          }
        }, 120);
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await plugin.speak({
            text,
            rate: speechRate,
            pitch,
            lang,
            gender,
            voiceName: voiceName || undefined,
            lockVoice: options?.lockVoice === true,
          });
          this._clearWordFallback();
          return true;
        } catch (e) {
          const msg = String(e?.message || e || "");
          if (attempt < 2 && /starting|ready|init/i.test(msg)) {
            await delay(400 * (attempt + 1));
            continue;
          }
          this._clearWordFallback();
          return false;
        }
      }
      this._clearWordFallback();
      return false;
    },

    async speakUtterance(text, rate, voice, handlers) {
      if (this.useNative()) {
        const spoken = handlers?.spokenText
          || await prepareSpeakText(text, this.voicePreset, {
            pronunciationMode: this.pronunciationMode,
            readingStyle: this.readingStyle,
            contentLanguage: handlers?.contentLanguage,
            language: handlers?.contentLanguage,
          });
        this.spokenText = spoken;
        const speakPreset = handlers?.contentLanguage === "en"
          ? (presetForSpeechText(spoken, this.voicePreset).startsWith("hi")
            ? (genderFromPreset(this.voicePreset) === "male" ? "in-en-male" : "in-en-female")
            : this.voicePreset)
          : this.voicePreset;
        return this.speakNative(spoken, rate * (handlers?.rateMultiplier || 1), speakPreset, handlers?.onword, {
          pitch: handlers?.pitch,
          wordSync: handlers?.wordSync || null,
          contentLanguage: handlers?.contentLanguage,
          forceEnglishLang: handlers?.contentLanguage === "en",
        }).then(ok => {
          if (ok) handlers?.onend?.();
          else handlers?.onerror?.();
          return ok;
        });
      }
      if (!this.synth) return Promise.resolve(false);
      const spoken = handlers?.spokenText
        || await prepareSpeakText(text, this.voicePreset, {
          pronunciationMode: this.pronunciationMode,
          readingStyle: this.readingStyle,
          contentLanguage: handlers?.contentLanguage,
          language: handlers?.contentLanguage,
        });
      this.spokenText = spoken;
      if (!spoken) return Promise.resolve(false);
      const wordSync = handlers?.wordSync || null;

      return new Promise(resolve => {
        const run = (useVoice, retried) => {
          // Mark replacement so the cancelled utterance's onend is not natural_end
          this._utteranceEndReason = window.TtsPlaybackSession?.END_REASON?.replacement || "replacement";
          this.synth.cancel();
          setTimeout(() => {
            this.resumeSynth();
            // Clear replacement reason for the new utterance unless stop() raced in
            if (this._utteranceEndReason === "replacement"
              || this._utteranceEndReason === (window.TtsPlaybackSession?.END_REASON?.replacement)) {
              this._utteranceEndReason = null;
            }
            const u = new SpeechSynthesisUtterance(spoken);
            const utteranceToken = handlers?.utteranceToken || `utt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            this._activeUtteranceToken = utteranceToken;
            let speechPreset = presetForSpeechText(spoken, this.voicePreset);
            if (handlers?.contentLanguage === "en" && isHindiPreset(speechPreset)) {
              speechPreset = genderFromPreset(speechPreset) === "male" ? "in-en-male" : "in-en-female";
            }
            const speechVoice = speechPreset === this.voicePreset
              ? useVoice
              : this.pickVoice(speechPreset, { contentLanguage: handlers?.contentLanguage || "en", forceEnglishVoice: handlers?.contentLanguage === "en" });
            u.rate = effectiveRate(rate * (handlers?.rateMultiplier || 1), speechPreset);
            u.pitch = handlers?.pitch || (this.readingStyle === "pravachan" ? 0.82 : this.readingStyle === "human" ? 0.9 : 1);
            if (speechVoice) {
              u.voice = speechVoice;
              u.lang = speechVoice.lang || langFromPreset(speechPreset);
            } else {
              u.lang = langFromPreset(speechPreset);
            }
            if (handlers?.contentLanguage === "en" && !/^en/i.test(u.lang || "")) {
              u.lang = "en-IN";
            }
            let settled = false;
            let gotBoundary = false;
            const finish = (ok, endReason) => {
              if (settled) return;
              settled = true;
              this._clearWordFallback();
              if (this._activeUtteranceToken === utteranceToken) this._activeUtteranceToken = null;
              const reason = endReason || (ok
                ? (window.TtsPlaybackSession?.END_REASON?.natural_end || "natural_end")
                : (window.TtsPlaybackSession?.END_REASON?.platform_error || "platform_error"));
              if (handlers?.resolveDetailed) {
                resolve({
                  ok: !!ok && reason === (window.TtsPlaybackSession?.END_REASON?.natural_end || "natural_end"),
                  endReason: reason,
                  utteranceToken,
                  sessionId: handlers?.sessionId || null,
                  chunkId: handlers?.chunkId || null,
                });
              } else {
                resolve(!!ok && reason === (window.TtsPlaybackSession?.END_REASON?.natural_end || "natural_end"));
              }
            };
            const speechRate = effectiveRate(rate * (handlers?.rateMultiplier || 1), speechPreset);
            u.onstart = () => {
              if (!(handlers?.onword || wordSync) || gotBoundary) return;
              // Estimated WPM fallback is gated inside _startWordFallback (usually off).
              this._wordFallbackTimer = setTimeout(() => {
                if (!gotBoundary && this.playing) {
                  this._startWordFallback(
                    spoken,
                    speechRate,
                    handlers?.onword || ((s, e, wi) => wordSync?.fromCharIndex(s, wi)),
                    wordSync
                  );
                }
              }, 180);
            };
            u.onend = () => {
              const pendingReason = this._utteranceEndReason;
              this._utteranceEndReason = null;
              // Stale session/chunk callbacks must not complete the active queue item
              if (handlers?.sessionId && handlers?.expectSessionId && handlers.sessionId !== handlers.expectSessionId) {
                handlers?.onend?.({ endReason: "replacement", ignored: true });
                finish(false, window.TtsPlaybackSession?.END_REASON?.replacement || "replacement");
                return;
              }
              if (pendingReason && pendingReason !== (window.TtsPlaybackSession?.END_REASON?.natural_end || "natural_end")) {
                handlers?.onend?.({ endReason: pendingReason, ignored: true });
                finish(false, pendingReason);
                return;
              }
              if (!this.playing && pendingReason) {
                handlers?.onend?.({ endReason: pendingReason, ignored: true });
                finish(false, pendingReason);
                return;
              }
              handlers?.onend?.({ endReason: window.TtsPlaybackSession?.END_REASON?.natural_end || "natural_end" });
              finish(true, window.TtsPlaybackSession?.END_REASON?.natural_end || "natural_end");
            };
            u.onerror = (ev) => {
              const errName = String(ev?.error || "");
              // Browser fires "interrupted" / "canceled" when cancel() is used
              if (/interrupted|canceled|cancelled/i.test(errName) || this._utteranceEndReason) {
                const reason = this._utteranceEndReason
                  || window.TtsPlaybackSession?.END_REASON?.browser_interruption
                  || "browser_interruption";
                this._utteranceEndReason = null;
                finish(false, reason);
                return;
              }
              if (useVoice && !retried) {
                run(null, true);
                return;
              }
              handlers?.onerror?.();
              finish(false, window.TtsPlaybackSession?.END_REASON?.platform_error || "platform_error");
            };
            u.onboundary = e => {
              if (e.name !== "word") return;
              gotBoundary = true;
              this._clearWordFallback();
              handlers?.onBoundary?.(e.charIndex);
              if (wordSync) {
                wordSync.fromBoundary();
              } else if (handlers?.onword) {
                handlers.onword(e.charIndex, e.charIndex + (e.charLength || 1));
              }
            };
            try {
              this.synth.speak(u);
              this.resumeSynth();
            } catch (_) {
              finish(false);
            }
          }, retried ? 60 : 100);
        };
        run(voice, false);
      });
    },

    preview(preset, rate, pronunciationMode) {
      this.prime();
      const p = normalizePreset(preset);
      const mode = normalizePronunciationMode(pronunciationMode || this.pronunciationMode);
      const sampleRate = rate || this.rate || 1;
      let sample;
      if (isHindiPreset(p)) sample = HI_PREVIEW_TEXT;
      else if (mode === "amps-enhanced" || mode === "basic") {
        if (window.AmpsSanskritTts?.normalizeSanskritForTTS) {
          sample = window.AmpsSanskritTts.normalizeSanskritForTTS(AMPS_PREVIEW_TEXT, mode);
        } else if (isHindiPreset(p)) {
          sample = applyAmpsPronunciation(AMPS_PREVIEW_TEXT);
        } else {
          sample = applyAmpsSingleVoicePronunciation(AMPS_PREVIEW_TEXT);
        }
      } else sample = PREVIEW_TEXT;
      if (this.useNative()) {
        this.speakNative(sample, sampleRate, p, null, { pitch: 1 });
        return true;
      }
      if (!this.synth) return false;
      this.pronunciationMode = mode;
      this.voicePreset = p;
      this.speakUtterance(sample, sampleRate, this.pickVoice(p, { pronunciationMode: mode }));
      return true;
    },

    getSpokenText() {
      return this.spokenText || "";
    },

    _apiConfig(options) {
      const cfg = options?.apiTts;
      if (!cfg?.apiUrl || !window.AmpsApiTts?.isConfigured?.(cfg.apiUrl)) return null;
      return cfg;
    },

    _apiVoiceFromPreset(preset) {
      const p = normalizePreset(preset);
      if (p === "in-en-male" || p === "en-male" || p === "hi-male") return "onyx";
      return "nova";
    },

    _apiVoiceFromConfig(cfg, preset) {
      return cfg?.voice || this._apiVoiceFromPreset(preset);
    },

    async _speakApiTimed(text, rate, options) {
      const cfg = this._apiConfig(options);
      if (!cfg) return false;
      const chanda = !!this.paragraphChanda?.[this.idx];
      const prepared = await prepareApiSegments(text, this.voicePreset, {
        pronunciationMode: this.pronunciationMode,
        readingStyle: this.readingStyle,
        pauseSettings: options?.pauseSettings || this.pauseSettings,
        chanda,
      });
      if (!prepared.length) return false;
      return window.AmpsApiTts.speakSegments(prepared, {
        apiUrl: cfg.apiUrl,
        apiKey: cfg.apiKey,
        voice: this._apiVoiceFromConfig(cfg, this.voicePreset),
        rate,
        style: this.readingStyle,
        provider: cfg.provider || "api",
      }, {
        isCancelled: () => !this.playing,
        onWord: this.onWord ? (start, seg) => {
          const fullText = this.paragraphs[this.idx] || text;
          const baseOffset = this.idx === this.startIdx ? this.startOffset : 0;
          const segmentBaseWord = charIndexToWordIndex(fullText, (seg?.offset || 0) + baseOffset);
          const originalSeg = seg?.originalText || seg?.text || "";
          const spokenSeg = seg?.text || "";
          if (!seg._ampsWordSync) {
            seg._ampsWordSync = createWordSync({
              fullText,
              segmentText: originalSeg,
              spokenText: spokenSeg,
              baseWordIndex: segmentBaseWord,
              paraIndex: this.idx,
              onWord: this.onWord,
            });
          }
          seg._ampsWordSync.fromCharIndex(start, null);
        } : null,
      });
    },

    async _speakApiText(text, rate, options) {
      return this._speakApiTimed(text, rate, options);
    },

    async _speakApiPravachan(text, rate, options) {
      return this._speakApiTimed(text, rate, options);
    },

    async speakSegmentList(segments, rate, voicePreset, pronunciationMode, options) {
      this.prime();
      this.stop();
      this.playing = true;
      this.paused = false;
      this.readingStyle = normalizeReadingStyle(options?.readingStyle);
      sessionCorpusLanguage = options?.corpusLanguage || "en";
      this.voicePreset = isHindiCorpus(sessionCorpusLanguage)
        ? hindiVoicePreset(voicePreset)
        : effectiveVoicePreset(voicePreset, this.readingStyle);
      this.sessionBrowserVoice = null;
      this.pronunciationMode = normalizePronunciationMode(pronunciationMode);
      this.rate = rate || 1;
      this.pauseSettings = options?.pauseSettings || null;
      this.paragraphChanda = Array.isArray(options?.paragraphChanda) ? options.paragraphChanda : [];
      const list = Array.isArray(segments) ? segments : [];
      if (!list.length) {
        this.playing = false;
        return false;
      }
      const apiCfg = this._apiConfig(options);
      if (apiCfg) {
        const prepared = [];
        for (const seg of list) {
          prepared.push(...await prepareApiSegments(seg.text, this.voicePreset, {
            pronunciationMode: this.pronunciationMode,
            readingStyle: this.readingStyle,
            pauseSettings: this.pauseSettings,
          }));
        }
        const ok = await window.AmpsApiTts.speakSegments(prepared, {
          apiUrl: apiCfg.apiUrl,
          apiKey: apiCfg.apiKey,
          voice: this._apiVoiceFromConfig(apiCfg, this.voicePreset),
          rate: this.rate,
          style: this.readingStyle,
          provider: apiCfg.provider || "api",
        }, { isCancelled: () => !this.playing });
        this.playing = false;
        return ok;
      }
      for (const seg of list) {
        if (!this.playing) break;
        if (seg.pauseBefore) await delay(seg.pauseBefore);
        const spoken = await prepareSpeakText(seg.text, this.voicePreset, { pronunciationMode: this.pronunciationMode, readingStyle: this.readingStyle });
        this.spokenText = spoken;
        let ok = false;
        if (this.useNative()) {
          ok = await this.speakNative(spoken, this.rate, this.voicePreset, null, { pitch: 0.9, allowChunks: false, lockVoice: true });
        } else if (this.synth) {
          await this.waitForVoices(1500);
          ok = await this.speakUtterance(spoken, this.rate, this.pickVoice(this.voicePreset, { pronunciationMode: this.pronunciationMode }), {});
        }
        if (!ok) {
          this.playing = false;
          return false;
        }
        if (seg.pauseAfter && this.playing) await delay(seg.pauseAfter);
      }
      this.playing = false;
      return true;
    },

    async speakParagraphs(texts, paraIds, rate, onHighlight, voicePreset, startIdx, onWord, pronunciationMode, options) {
      this.prime();
      this.stop(window.TtsPlaybackSession?.END_REASON?.replacement || "replacement");
      this.paragraphs = texts || [];
      this.paraIds = paraIds || [];
      this.idx = startIdx || 0;
      this.startIdx = this.idx;
      this.rate = rate || 1;
      this.readingStyle = normalizeReadingStyle(options?.readingStyle);
      sessionCorpusLanguage = options?.corpusLanguage || "en";
      this.voicePreset = isHindiCorpus(sessionCorpusLanguage)
        ? hindiVoicePreset(voicePreset)
        : effectiveVoicePreset(voicePreset, this.readingStyle);
      this.sessionBrowserVoice = null;
      this.pronunciationMode = normalizePronunciationMode(pronunciationMode);
      this.startOffset = Math.max(0, Number(options?.startOffset) || 0);
      this.pauseSettings = options?.pauseSettings || null;
      this.paragraphChanda = Array.isArray(options?.paragraphChanda) ? options.paragraphChanda : [];
      this.onHighlight = onHighlight;
      this.onWord = onWord || null;
      this.playing = true;
      this.paused = false;
      this._platformHints = window.TtsPlatformCapabilities?.resolve?.({
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        nativeAndroid: this.useNative(),
      }) || null;
      const apiCfg = this._apiConfig(options);

      // Deterministic queue path (language-aware chunks + verified completion gate)
      if (window.TtsQueueController?.playParagraphList && !apiCfg && !options?.forceLegacySpeak) {
        const list = [];
        for (let i = this.idx; i < this.paragraphs.length; i += 1) {
          const baseOffset = i === this.startIdx
            ? Math.min(this.startOffset, String(this.paragraphs[i] || "").length)
            : 0;
          const full = String(this.paragraphs[i] || "");
          list.push({
            id: this.paraIds[i],
            text: baseOffset ? full.slice(baseOffset) : full,
            paragraphIndex: i,
          });
        }
        const self = this;
        const narrate = this.readingStyle !== "normal";
        const pauses = pauseSettings(this.pauseSettings);
        const results = await window.TtsQueueController.playParagraphList(list, {
          origin: options?.origin || "reader",
          bookId: options?.bookId,
          chapterId: options?.chapterId,
          voicePreset: this.voicePreset,
          rate: this.rate,
          pronunciationMode: this.pronunciationMode,
          corpusLanguage: sessionCorpusLanguage,
          platformHints: this._platformHints,
          sentenceChunks: narrate,
          paragraphPauseMs: narrate ? Math.max(pauses.paragraph, 850) : pauses.paragraph,
          getElement: (id) => (typeof document !== "undefined" ? document.getElementById(id) : null),
          onParagraphStart: (localIdx, id, text) => {
            const realIdx = (this.startIdx || 0) + localIdx;
            self.idx = realIdx;
            if (onHighlight) onHighlight(realIdx, id, text);
          },
          onRecovery: (msg) => {
            try {
              window.dispatchEvent?.(new CustomEvent("amps-tts-recovery", { detail: { message: msg } }));
            } catch (_) { /* */ }
          },
          speakChunkFn: async (req) => {
            if (!self.playing) {
              return {
                ok: false,
                endReason: window.TtsPlaybackSession?.END_REASON?.user_stop || "user_stop",
              };
            }
            await self._waitWhilePaused();
            if (!self.playing) {
              return {
                ok: false,
                endReason: window.TtsPlaybackSession?.END_REASON?.user_stop || "user_stop",
              };
            }
            const preset = req.voicePreset || self.voicePreset;
            const voice = self.pickVoice(preset, {
              contentLanguage: req.language,
              forceEnglishVoice: req.language === "en",
            });
            const prosody = narrate
              ? podcastProsody(req, self.readingStyle, pauses, isHindiCorpus(sessionCorpusLanguage))
              : null;
            const breathe = async () => {
              if (prosody?.pauseAfter && self.playing) await delay(prosody.pauseAfter);
            };
            const emitWord = self._followChunk(req);
            if (self.useNative()) {
              const ok = await self.speakNative(req.processedText || req.text, (req.rate || self.rate) * (prosody?.rateMultiplier || 1), preset, (start) => emitWord(start), {
                allowChunks: false,
                lockVoice: true,
                pitch: prosody?.pitch,
                contentLanguage: req.language,
                forceEnglishLang: req.language === "en",
              });
              if (ok) await breathe();
              // Native path: treat false as cancel/error; true as natural_end when still playing
              if (!ok) {
                return {
                  ok: false,
                  endReason: self._utteranceEndReason
                    || (self.playing
                      ? (window.TtsPlaybackSession?.END_REASON?.platform_error || "platform_error")
                      : (window.TtsPlaybackSession?.END_REASON?.user_stop || "user_stop")),
                };
              }
              return {
                ok: true,
                endReason: window.TtsPlaybackSession?.END_REASON?.natural_end || "natural_end",
              };
            }
            const detailed = await self.speakUtterance(req.text, req.rate || self.rate, voice, {
              spokenText: req.processedText || req.text,
              contentLanguage: req.language,
              utteranceToken: req.utteranceToken,
              sessionId: req.sessionId,
              chunkId: req.chunkId,
              resolveDetailed: true,
              onBoundary: (charIndex) => {
                req.onBoundary?.(charIndex);
                emitWord(charIndex);
              },
              rateMultiplier: prosody?.rateMultiplier,
              pitch: prosody?.pitch,
            });
            if (detailed === true || detailed?.ok) await breathe();
            if (detailed && typeof detailed === "object") return detailed;
            return {
              ok: !!detailed,
              endReason: detailed
                ? (window.TtsPlaybackSession?.END_REASON?.natural_end || "natural_end")
                : (window.TtsPlaybackSession?.END_REASON?.unknown || "unknown"),
            };
          },
        });
        this.playing = false;
        highlightSentenceIn(null, 0, 0);
        if (onHighlight) onHighlight(-1);
        const failed = results.find(r => !r.ok && !r.empty);
        return !failed;
      }

      if (apiCfg) {
        let apiWorked = true;
        for (let i = this.idx; i < this.paragraphs.length; i++) {
          if (!this.playing) break;
          await this._waitWhilePaused();
          if (!this.playing) break;
          this.idx = i;
          const baseOffset = i === startIdx ? Math.min(this.startOffset, String(this.paragraphs[i] || "").length) : 0;
          const speakText = baseOffset ? String(this.paragraphs[i] || "").slice(baseOffset) : this.paragraphs[i];
          const spoken = await prepareSpeakText(speakText, this.voicePreset, { pronunciationMode: this.pronunciationMode, readingStyle: this.readingStyle });
          if (!this.playing) break;
          this.spokenText = spoken;
          if (onHighlight) onHighlight(i, this.paraIds[i], spoken);
          const ok = await this._speakApiTimed(speakText, this.rate, options);
          if (!ok) {
            apiWorked = false;
            break;
          }
          await delayBetweenParagraphs(this, i < this.paragraphs.length - 1);
        }
        if (apiWorked && !this.playing) {
          if (onHighlight) onHighlight(-1);
          return true;
        }
        if (apiWorked) {
          this.playing = false;
          if (onHighlight) onHighlight(-1);
          return true;
        }
        if (apiCfg.provider === "my-voice") {
          this.playing = false;
          if (onHighlight) onHighlight(-1);
          return false;
        }
        // Continue from the paragraph that failed — do not restart at startIdx.
        this.playing = true;
        this.paused = false;
      }

      if (this.useNative()) {
        await delay(150);
        for (let i = this.idx; i < this.paragraphs.length; i++) {
          if (!this.playing) break;
          await this._waitWhilePaused();
          if (!this.playing) break;
          this.idx = i;
          const baseOffset = i === startIdx ? Math.min(this.startOffset, String(this.paragraphs[i] || "").length) : 0;
          const speakText = baseOffset ? String(this.paragraphs[i] || "").slice(baseOffset) : this.paragraphs[i];
          const spoken = await prepareSpeakText(speakText, this.voicePreset, { pronunciationMode: this.pronunciationMode, readingStyle: this.readingStyle });
          if (!this.playing) break;
          this.spokenText = spoken;
          if (onHighlight) onHighlight(i, this.paraIds[i], spoken);
          const ok = await this._speakTimedNative(this.paragraphs[i], i, onWord, baseOffset);
          if (!ok) {
            this.playing = false;
            if (onHighlight) onHighlight(-1);
            return false;
          }
          await delayBetweenParagraphs(this, i < this.paragraphs.length - 1);
        }
        this.playing = false;
        if (onHighlight) onHighlight(-1);
        return true;
      }

      if (!this.synth) return false;
      await this.waitForVoices(1500);
      this._next();
      return true;
    },

    async _next() {
      if (!this.playing) return;
      if (this.idx >= this.paragraphs.length) {
        this.playing = false;
        if (this.onHighlight) this.onHighlight(-1);
        return;
      }
      const voice = (this.readingStyle === "pravachan" || this.readingStyle === "human")
        ? (this.sessionBrowserVoice || (this.sessionBrowserVoice = this.pickVoice(this.voicePreset, { pronunciationMode: this.pronunciationMode })))
        : this.pickVoice(this.voicePreset, { pronunciationMode: this.pronunciationMode });
      const baseOffset = this.idx === this.startIdx
        ? Math.min(this.startOffset, String(this.paragraphs[this.idx] || "").length)
        : 0;
      const speakText = baseOffset ? String(this.paragraphs[this.idx] || "").slice(baseOffset) : this.paragraphs[this.idx];
      const spoken = await prepareSpeakText(speakText, this.voicePreset, { pronunciationMode: this.pronunciationMode, readingStyle: this.readingStyle });
      this.spokenText = spoken;
      if (this.onHighlight) this.onHighlight(this.idx, this.paraIds[this.idx], spoken);
      const okStyle = await this._speakTimedBrowser(this.paragraphs[this.idx], this.idx, voice, baseOffset);
      if (!this.playing) return;
      // Do NOT advance on failed / incomplete paragraph.
      if (!okStyle) {
        this.playing = false;
        if (this.onHighlight) this.onHighlight(-1);
        try {
          window.dispatchEvent?.(new CustomEvent("amps-tts-recovery", {
            detail: { message: "Reading paused before this paragraph was completed." },
          }));
        } catch (_) { /* */ }
        return;
      }
      this.idx += 1;
      await delayBetweenParagraphs(this, this.idx < this.paragraphs.length);
      this._next();
    },

    async _speakTimedNative(text, paraIndex, onWord, startOffset) {
      const offset = Math.max(0, Number(startOffset) || 0);
      const segments = timedSegmentsForText(text, this.pauseSettings, this.readingStyle, {
        chanda: !!this.paragraphChanda?.[paraIndex],
      })
        .filter(seg => seg.offset + seg.text.length > offset)
        .map(seg => offset > seg.offset && offset < seg.offset + seg.text.length
          ? { ...seg, text: seg.text.slice(offset - seg.offset), offset }
          : seg);
      if (!segments.length) return true;
      for (const seg of segments) {
        if (!this.playing) return false;
        await this._waitWhilePaused();
        if (!this.playing) return false;
        if (seg.pauseBefore) await delay(seg.pauseBefore);
        const spoken = await prepareSpeakText(seg.text, this.voicePreset, { pronunciationMode: this.pronunciationMode, readingStyle: this.readingStyle });
        this.spokenText = spoken;
        const segmentBaseWord = charIndexToWordIndex(text, seg.offset);
        const wordSync = onWord
          ? createWordSync({
              fullText: text,
              segmentText: seg.text,
              spokenText: spoken,
              baseWordIndex: segmentBaseWord,
              paraIndex,
              onWord,
            })
          : null;
        const ok = await this.speakNative(spoken, this.rate * (seg.rateMultiplier || 1), this.voicePreset, null, {
          pitch: seg.pitch || 0.9,
          allowChunks: false,
          lockVoice: true,
          wordSync,
        });
        this._clearWordFallback();
        if (!ok) return false;
        if (this.playing) await delay(seg.pauseAfter);
      }
      return true;
    },

    async _speakPravachanNative(text, paraIndex, onWord, startOffset) {
      return this._speakTimedNative(text, paraIndex, onWord, startOffset);
    },

    async _speakTimedBrowser(text, paraIndex, voice, startOffset) {
      const offset = Math.max(0, Number(startOffset) || 0);
      const segments = timedSegmentsForText(text, this.pauseSettings, this.readingStyle, {
        chanda: !!this.paragraphChanda?.[paraIndex],
      })
        .filter(seg => seg.offset + seg.text.length > offset)
        .map(seg => offset > seg.offset && offset < seg.offset + seg.text.length
          ? { ...seg, text: seg.text.slice(offset - seg.offset), offset }
          : seg);
      if (!segments.length) return true;
      for (const seg of segments) {
        if (!this.playing) return false;
        await this._waitWhilePaused();
        if (!this.playing) return false;
        if (seg.pauseBefore) await delay(seg.pauseBefore);
        const spoken = await prepareSpeakText(seg.text, this.voicePreset, { pronunciationMode: this.pronunciationMode, readingStyle: this.readingStyle });
        this.spokenText = spoken;
        const segmentBaseWord = charIndexToWordIndex(text, seg.offset);
        const wordSync = this.onWord
          ? createWordSync({
              fullText: text,
              segmentText: seg.text,
              spokenText: spoken,
              baseWordIndex: segmentBaseWord,
              paraIndex,
              onWord: this.onWord,
            })
          : null;
        const speechPreset = presetForSpeechText(spoken, this.voicePreset);
        const segVoice = this.pickVoice(speechPreset);
        const ok = await this.speakUtterance(seg.text, this.rate, segVoice, {
          rateMultiplier: seg.rateMultiplier || 1,
          pitch: seg.pitch,
          spokenText: spoken,
          wordSync,
        });
        this._clearWordFallback();
        if (!ok) return false;
        if (this.playing) await delay(seg.pauseAfter);
      }
      return true;
    },

    async _speakPravachanBrowser(text, paraIndex, voice, startOffset) {
      return this._speakTimedBrowser(text, paraIndex, voice, startOffset);
    },

    sleepTimer(minutes, onDone) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => { this.stop(); if (onDone) onDone(); }, minutes * 60000);
    },

    normalizePreset,
    normalizePronunciationMode,
    resolveSanskritSpeechMode,
    pickVoiceForSanskrit,
    pickVoiceForEnglish,
    normalizeReadingStyle,
    effectiveVoicePreset,
    applyAmpsPronunciation,
    applyAmpsSingleVoicePronunciation,
    prepareApiText: prepareSpeakText,
    prepareApiSegments,
    timedReadingSegments,
    timedSegmentsForText,
    normalizeEnglishArticleForSpeech,
    resetUserPronunciationCache,
    charIndexToWordIndex,
    wordIndexToCharIndex,
    buildSpokenToOriginalWordMap,
    createWordSync,
    wordSpanHtml,
    highlightWordIn,
    smoothScrollWordIntoView,
    tokenizeWords,
    /**
     * Speak orchestrator-routed segments with per-segment language/voice.
     * One AmpsAudio session — no independent overlapping Audio instances.
     */
    async speakRoutedSegments(segments, request) {
      if (!segments?.length) return false;
      this.stop(window.TtsPlaybackSession?.END_REASON?.replacement || "replacement");
      this.playing = true;
      const rate = request?.rate || this.rate || 1;
      for (let i = 0; i < segments.length; i++) {
        if (!this.playing) return false;
        const seg = segments[i];
        const preset = seg.voicePreset || request?.voicePreset || this.voicePreset || "in-en-female";
        const voice = this.pickVoice(preset, {
          contentLanguage: seg.language,
          pronunciationFrontend: seg.pronunciationFrontend,
          forceEnglishVoice: seg.language === "en",
        });
        const detailed = await this.speakUtterance(seg.originalText || seg.text, rate, voice, {
          spokenText: seg.text,
          contentLanguage: seg.language,
          pronunciationMode: seg.language === "en" ? "off" : (request?.pronunciationMode || "amps-enhanced"),
          resolveDetailed: true,
        });
        const ok = detailed && typeof detailed === "object"
          ? !!detailed.ok && detailed.endReason === (window.TtsPlaybackSession?.END_REASON?.natural_end || "natural_end")
          : !!detailed;
        if (!ok) {
          this.playing = false;
          return false;
        }
      }
      this.playing = false;
      return true;
    },
    isSupported() {
      return isCapacitorAndroid() || !!getNativeTts() || !!(typeof window !== "undefined" && window.speechSynthesis);
    },
  };

  window.AmpsAudio = AudioSync;

  if (typeof document !== "undefined") {
    const primeOnce = () => AudioSync.prime();
    document.addEventListener("touchstart", primeOnce, { capture: true, passive: true });
    document.addEventListener("click", primeOnce, { capture: true, passive: true });
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => AudioSync.initVoices());
    } else {
      AudioSync.initVoices();
    }
  }
})();
