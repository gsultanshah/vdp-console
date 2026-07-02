npm run enrich-voters -- --halka LA39 --parallel 10

3 step process
1. Upload
2. OCR
3. Mapping and enrichment

Run All 3 parallel processes

Run uploader > process OCR as uploaded > Enrich as processed

OCR
Cron job every minute and process 10 uplaods at a time

Enrich
Cron job every minute and process 10 enrichments at a time

phone number data is linked automatically to the voter record

Objective: Ready to use for election as soon as it is uploaded

Run integerity checks after each step
And overall data integrity checks

random searches

Mark Ready state for each halka (and block code)

Implemnet Real time database for live progress and status updates

5010032