/* Extra UI text for printing, photos and the bill of quantities. Merged into window.CB_I18N.
   English is the fallback for any missing key.
   Afaan Oromoo and Amharic wording should be reviewed by a native speaker. */
(function () {
  var add = {
    en: {
      print: 'Print / save PDF', print_certificate: 'Print certificate', print_statement: 'Print project statement', print_failed: 'Could not open the print dialog',
      cert_title: 'Interim Payment Certificate', statement_title: 'Project statement', prepared: 'Prepared on', valuation: 'Valuation',
      prev_certified: 'Previously certified', this_cert: 'This certificate', cum_certified: 'Total certified to date',
      contractor: 'Contractor', consultant: 'Client / Consultant', signature: 'Name, signature and date',
      work_done: 'Work done to date', item_no: 'No.', item_desc: 'Description', unit: 'Unit', qty: 'Qty', rate: 'Rate', amount: 'Amount', done_to_date: 'Done to date',
      boq: 'BoQ', boq_title: 'Bill of quantities', boq_total: 'BoQ total', work_value: 'Value of work done', physical_pct: 'Physical progress',
      boq_vs_contract: 'BoQ minus contract sum', set_contract_from_boq: 'Set contract sum from BoQ',
      add_item: 'Add item', edit_item: 'Edit item', import_boq: 'Import BoQ (CSV)', export_boq: 'Export BoQ (CSV)',
      cert_from_progress: 'Create certificate from progress', nothing_to_certify: 'No new work to certify since the last certificate.',
      no_items: 'No BoQ items yet. Tap + to add one, or import a CSV.', boq_import_confirm: 'Add {n} items to this BoQ?',
      confirm_delete_item: 'Delete this item?', over_qty: 'More than the BoQ quantity', heading_note: 'Leave quantity and rate empty to make a heading row.',
      boq_csv_note: 'CSV columns: No, Description, Unit, Qty, Rate (and optionally Done).',
      photos: 'Photos', add_photo: 'Add photo', site_photos: 'Site photos', no_photos: 'No photos yet.', remove_photo: 'Remove photo',
      confirm_remove_photo: 'Remove this photo?', photo_fail: 'Could not add that photo', photo_limit: 'At most 12 photos here',
      photo_missing: 'Photo not on this device', backup_photos: 'Backup photos', photos_none: 'No photos to back up',
      photos_restored: '{n} photos restored', photos_note: 'Photos are stored on this device and are not inside the normal backup. Back them up here.'
    },
    om: {
      print: 'Maxxansi / PDF olkaa\'i', print_certificate: 'Ragaa maxxansi', print_statement: 'Ibsa pirojektii maxxansi', print_failed: 'Fuula maxxansuu banuun hin danda\'amne',
      cert_title: 'Ragaa Kaffaltii Yeroo', statement_title: 'Ibsa pirojektii', prepared: 'Guyyaa qophaa\'e', valuation: 'Qabxii hojii',
      prev_certified: 'Kan duraan mirkanaa\'e', this_cert: 'Ragaa kana', cum_certified: 'Waliigala hanga ammaatti mirkanaa\'e',
      contractor: 'Koontiraaktara', consultant: 'Maamila / Gorsaa', signature: 'Maqaa, mallattoo fi guyyaa',
      work_done: 'Hojii hanga ammaatti hojjetame', item_no: 'Lak.', item_desc: 'Ibsa', unit: 'Safartuu', qty: 'Hanga', rate: 'Gatii', amount: 'Waliigala', done_to_date: 'Hanga ammaatti hojjetame',
      boq: 'BoQ', boq_title: 'Tarreeffama hojii fi hanga (BoQ)', boq_total: 'Waliigala BoQ', work_value: 'Gatii hojii hojjetame', physical_pct: 'Adeemsa hojii',
      boq_vs_contract: 'BoQ hir\'ifame waliigala koontiraata', set_contract_from_boq: 'Waliigala koontiraata BoQ irraa kaa\'i',
      add_item: 'Wanta dabali', edit_item: 'Wanta sirreessi', import_boq: 'BoQ galchi (CSV)', export_boq: 'BoQ baasi (CSV)',
      cert_from_progress: 'Adeemsa irraa ragaa uumi', nothing_to_certify: 'Ragaa darbe booda hojiin haaraan mirkaneeffamu hin jiru.',
      no_items: 'Wanti BoQ hin jiru. Dabaluuf + tuqi yookaan CSV galchi.', boq_import_confirm: 'Wanta {n} BoQ kanatti dabaluu?',
      confirm_delete_item: 'Wanta kana haquu?', over_qty: 'Hanga BoQ caalee jira', heading_note: 'Sarara mataduree gochuuf hanga fi gatii duwwaa dhiisi.',
      boq_csv_note: 'Kolummii CSV: Lak., Ibsa, Safartuu, Hanga, Gatii (fi filannoon Hojjetame).',
      photos: 'Suuraalee', add_photo: 'Suura dabali', site_photos: 'Suuraalee bakka hojii', no_photos: 'Suuraan hin jiru.', remove_photo: 'Suura balleessi',
      confirm_remove_photo: 'Suura kana balleessuu?', photo_fail: 'Suura sana dabaluun hin danda\'amne', photo_limit: 'Asitti suura 12 qofa',
      photo_missing: 'Suurri meeshaa kana irra hin jiru', backup_photos: 'Suuraalee kuusi (backup)', photos_none: 'Suuraan kuusuu hin jiru',
      photos_restored: 'Suuraan {n} deebi\'eera', photos_note: 'Suuraaleen meeshaa kana irra kuufamu; backup idilee keessa hin jiran. Asitti kuusi.'
    },
    am: {
      print: 'አትም / PDF አስቀምጥ', print_certificate: 'ሰርተፊኬት አትም', print_statement: 'የፕሮጀክት መግለጫ አትም', print_failed: 'የማተሚያ መስኮቱን መክፈት አልተቻለም',
      cert_title: 'ጊዜያዊ የክፍያ ሰርተፊኬት', statement_title: 'የፕሮጀክት መግለጫ', prepared: 'የተዘጋጀበት ቀን', valuation: 'የሥራ ግምት',
      prev_certified: 'ከዚህ በፊት የተረጋገጠ', this_cert: 'ይህ ሰርተፊኬት', cum_certified: 'እስካሁን የተረጋገጠ ጠቅላላ',
      contractor: 'ኮንትራክተር', consultant: 'ደንበኛ / አማካሪ', signature: 'ስም፣ ፊርማና ቀን',
      work_done: 'እስካሁን የተሠራ ሥራ', item_no: 'ቁ.', item_desc: 'መግለጫ', unit: 'መለኪያ', qty: 'መጠን', rate: 'ነጠላ ዋጋ', amount: 'ድምር', done_to_date: 'እስካሁን የተሠራ',
      boq: 'BoQ', boq_title: 'የሥራና የብዛት ዝርዝር (BoQ)', boq_total: 'የBoQ ድምር', work_value: 'የተሠራ ሥራ ዋጋ', physical_pct: 'የሥራ ሂደት',
      boq_vs_contract: 'BoQ ሲቀነስ የውል ድምር', set_contract_from_boq: 'የውል ድምርን ከBoQ አድርግ',
      add_item: 'ዝርዝር ጨምር', edit_item: 'ዝርዝር አርም', import_boq: 'BoQ አስገባ (CSV)', export_boq: 'BoQ ላክ (CSV)',
      cert_from_progress: 'ከሂደቱ ሰርተፊኬት ፍጠር', nothing_to_certify: 'ከመጨረሻው ሰርተፊኬት ወዲህ የሚረጋገጥ አዲስ ሥራ የለም።',
      no_items: 'ገና የBoQ ዝርዝር የለም። ለመጨመር + ይንኩ ወይም CSV ያስገቡ።', boq_import_confirm: '{n} ዝርዝሮች ወደዚህ BoQ ይጨመሩ?',
      confirm_delete_item: 'ይህ ዝርዝር ይሰረዝ?', over_qty: 'ከBoQ መጠን በላይ ነው', heading_note: 'የርዕስ መስመር ለማድረግ መጠንና ዋጋን ባዶ ይተዉ።',
      boq_csv_note: 'የCSV ዓምዶች፦ ቁ.፣ መግለጫ፣ መለኪያ፣ መጠን፣ ዋጋ (እና አማራጭ የተሠራ)።',
      photos: 'ፎቶዎች', add_photo: 'ፎቶ ጨምር', site_photos: 'የሳይት ፎቶዎች', no_photos: 'ገና ፎቶ የለም።', remove_photo: 'ፎቶ አስወግድ',
      confirm_remove_photo: 'ይህ ፎቶ ይወገድ?', photo_fail: 'ያንን ፎቶ መጨመር አልተቻለም', photo_limit: 'እዚህ ቢበዛ 12 ፎቶዎች',
      photo_missing: 'ፎቶው በዚህ መሣሪያ ላይ የለም', backup_photos: 'ፎቶዎችን ምትኬ አስቀምጥ', photos_none: 'ምትኬ የሚቀመጥ ፎቶ የለም',
      photos_restored: '{n} ፎቶዎች ተመልሰዋል', photos_note: 'ፎቶዎች በዚህ መሣሪያ ላይ ይቀመጣሉ፤ በተለመደው ምትኬ ውስጥ የሉም። እዚህ ምትኬ ያስቀምጡ።'
    }
  };
  Object.keys(add).forEach(function (lang) {
    var d = window.CB_I18N[lang] || (window.CB_I18N[lang] = {});
    Object.keys(add[lang]).forEach(function (k) { d[k] = add[lang][k]; });
  });
})();
