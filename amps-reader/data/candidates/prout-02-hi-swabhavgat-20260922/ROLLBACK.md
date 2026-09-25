# Rollback

Canonical Hindi Part 2 was **not** replaced. If a later apply writes `ch-02` from `proposed-chapter.json`:

```bash
cd /Users/hariishananda/Amps-Library-PMD-v37-Test
git checkout -- amps-reader/data/books/prout-in-a-nutshell-02-hi.json \
  amps-reader/data/search/prout-in-a-nutshell-02-hi.json
cp amps-reader/data/books/prout-in-a-nutshell-02-hi.json \
  /Users/hariishananda/Amps-Library/amps-reader/data/books/
cp amps-reader/data/search/prout-in-a-nutshell-02-hi.json \
  /Users/hariishananda/Amps-Library/amps-reader/data/search/
cp amps-reader/data/books/prout-in-a-nutshell-02-hi.json \
  /Users/hariishananda/Amps-Library/www/amps-reader/data/books/
cp amps-reader/data/search/prout-in-a-nutshell-02-hi.json \
  /Users/hariishananda/Amps-Library/www/amps-reader/data/search/
```

Then confirm `ch-02` has 5 paragraphs and `ch-01` still has 34 `humanCorrected` paragraphs.
