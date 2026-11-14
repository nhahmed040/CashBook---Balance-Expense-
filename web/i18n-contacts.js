/* UI text for contacts, filters, businesses, reminders and Excel/PDF export. Merged into window.CB_I18N.
   English is the fallback for any missing key. Afaan Oromoo and Amharic wording should be reviewed by a native speaker. */
(function () {
  var add = {
    en: {
      advance_pct: 'Advance payment received (% of contract)', recovery_pct: 'Advance repayment %', cash_received: 'Cash received', vat_wht_pct: 'VAT withheld (% of VAT)', work_incl_vat: 'Work including VAT', penalty: 'Penalty', pay_to_contractor: 'Payment to contractor', vat_wht_amt: 'VAT withheld', of_vat: 'of VAT', cash_due: 'Cash to receive', wht_receipt: 'Withholding receipt no.', vat_wht_receipt: 'VAT withholding receipt no.', receipt_missing: 'receipt missing', tax_receipts: 'Tax receipts', adv_auto: 'Automatic', adv_manual: 'Enter amount', adv_manual_amount: 'Advance repayment amount', contract_incl_vat: 'Contract sum incl. VAT', your_books: 'Your Books', tap_switch_biz: 'Tap to switch business', add_new_book: 'Add New Book', add_new_book_sub: 'Click to quickly add books', search_books: 'Search books', no_books_found: 'No books found.', updated_on: 'Updated on', no_entries_short: 'No entries yet', my_books: 'My books', sort_updated: 'Last updated', sort_name: 'Name', sort_balance: 'Balance', m_rename: 'Rename', m_export: 'Export (CSV)', m_share: 'Share with people', m_project: 'Link to a project', m_business: 'Move to a business', m_delete: 'Delete book', book_name: 'Book name', switch_business: 'Switch business', pick_business_first: 'Pick a business first', staff: 'Staff', back: 'Back', from_phonebook: '📱 From phone book', phonebook_opt: '📱 From phone book…', more_filters: 'More filters (contact, mode, member, category)', contacts: 'Contacts', contact: 'Contact', add_contact: 'Add contact', edit_contact: 'Edit contact', search_contacts: 'Search name or phone',
      no_contacts: 'No contacts yet. Add customers and suppliers, then pick them on entries.', no_contact_opt: 'No contact', new_contact_opt: '➕ New contact…',
      all_contacts: 'All contacts', all_kinds: 'All types', kind_customer: 'Customer', kind_supplier: 'Supplier', kind_other: 'Other',
      contact_name: 'Name', contact_phone: 'Phone', contact_email: 'Email', contact_address: 'Address', contact_kind: 'Type', contact_note: 'Note',
      received_total: 'Received', paid_total: 'Paid', net_balance: 'Net', entries_n: 'Entries: {n}', show_entries: 'Show entries',
      confirm_delete_contact: 'Delete this contact? Its entries stay, but lose the link.', contacts_summary: '{n} contacts · received {i} · paid {o}',
      payment_mode: 'Payment mode', all_modes: 'All modes', mode_none: 'Mode', mode_cash: 'Cash', mode_bank: 'Bank', mode_mobile: 'Mobile money', mode_cheque: 'Cheque', mode_other: 'Other',
      member: 'Member', all_members: 'All members', all_categories: 'All categories', me: 'Me',
      business: 'Business', all_businesses: 'All businesses', businesses: 'Businesses', add_business: 'Add business', rename_business: 'Rename', delete_business: 'Delete business',
      business_name: 'Business name', confirm_delete_business: 'Delete this business? Its books stay and move to “no business”.',
      staff: 'Staff', add_staff: 'Add staff member', edit_staff: 'Edit staff member', staff_name: 'Name', staff_phone: 'Phone', staff_role: 'Role', no_staff: 'No staff yet.',
      role_manager: 'Manager', role_accountant: 'Accountant', role_cashier: 'Cashier', role_viewer: 'Viewer', no_business: 'No business',
      staff_note: 'Staff are a directory for tagging who made an entry. To let someone use a book, share it from Settings (Online sync) as editor or view only.',
      reminders: 'Reminders', due_date: 'Due date', due_label: 'due', overdue: 'Overdue', due_soon: 'Due soon', bills_due_banner: '⏰ {n} unpaid bills overdue or due soon', unpaid_cert: 'Certificate unpaid by client', unpaid_bill: 'Bill to pay',
      export_report: 'Export report', export_excel: 'Excel', export_pdf: 'PDF / print', report_title: 'Cash report', this_book: 'This book', all_books_opt: 'All books',
      export_boq_xlsx: 'Export Summary BOQ (Excel)', export_cert_xlsx: 'Certificate (Excel)', xlsx_saved: 'Excel file ready', period: 'Period',
      contractor_name: 'Contractor', variation_total: 'Variation orders total', rebate_pct: 'Rebate %',
      by_category: 'Category', by_mode: 'Payment mode', by_member: 'Member', by_contact: 'Contact', by_book: 'Book',
      cf_delete_row: 'Delete “{name}”? This cannot be undone.', cf_pay_bill: 'Record payment of {amount} to {name}? This cannot be undone.',
      cf_receive: 'Record {amount} received for {name}? This cannot be undone.', cf_wages: 'Mark wages of {total} for {from} – {to} as paid? This cannot be undone.',
      cf_remove_pin: 'Remove the PIN lock? Anyone who opens the app will see your data.', cf_revoke: 'Revoke all invite codes for “{name}”? People who have not joined yet will need a new code.',
      cf_remove_member: 'Remove {name} from “{book}”? They lose access to this book.', cf_signout: 'Sign out of online sync on this phone?',
      add_sum_row: 'Add summary row', sum_row: 'Summary row', sum_label: 'Label', sum_default: 'Total carried to summary',
      sum_note: 'Adds up all items above it, back to the previous summary row. It is not counted again in the BoQ total.',
      row_menu: 'Row options', insert_above: 'Insert item above', insert_below: 'Insert item below', sum_above: 'Insert summary row above', sum_below: 'Insert summary row below',
      move_up: 'Move up', move_down: 'Move down'
    },
    om: {
      contacts: 'Quunnamtoota', contact: 'Quunnamtaa', add_contact: 'Quunnamtaa dabali', no_contacts: 'Ammaaf quunnamtaan hin jiru.',
      kind_customer: 'Maamilaa', kind_supplier: 'Dhiyeessaa', kind_other: 'Kan biraa', contact_name: 'Maqaa', contact_phone: 'Bilbila',
      payment_mode: 'Akkaataa kaffaltii', mode_cash: 'Maallaqa harkaa', mode_bank: 'Baankii', mode_mobile: 'Maallaqa bilbilaa', mode_cheque: 'Chequ', mode_other: 'Kan biraa',
      member: 'Miseensa', business: 'Daldala', businesses: 'Daldalawwan', staff: 'Hojjettoota', reminders: 'Yaadachiisa', due_date: 'Guyyaa kaffaltii',
      export_report: 'Gabaasa baasi', export_excel: 'Excel', export_pdf: 'PDF / maxxansi', export_boq_xlsx: 'Cuunfaa BOQ baasi (Excel)', export_cert_xlsx: 'Ragaa kaffaltii (Excel)'
    },
    am: {
      contacts: 'እውቂያዎች', contact: 'እውቂያ', add_contact: 'እውቂያ ጨምር', no_contacts: 'ገና እውቂያ የለም።',
      kind_customer: 'ደንበኛ', kind_supplier: 'አቅራቢ', kind_other: 'ሌላ', contact_name: 'ስም', contact_phone: 'ስልክ',
      payment_mode: 'የክፍያ መንገድ', mode_cash: 'ጥሬ ገንዘብ', mode_bank: 'ባንክ', mode_mobile: 'ሞባይል ገንዘብ', mode_cheque: 'ቼክ', mode_other: 'ሌላ',
      member: 'አባል', business: 'ንግድ', businesses: 'ንግዶች', staff: 'ሠራተኞች', reminders: 'ማስታወሻዎች', due_date: 'የመክፈያ ቀን',
      export_report: 'ሪፖርት ላክ', export_excel: 'Excel', export_pdf: 'PDF / አትም', export_boq_xlsx: 'የBOQ ማጠቃለያ ላክ (Excel)', export_cert_xlsx: 'ሰርተፊኬት (Excel)'
    }
  };
  Object.keys(add).forEach(function (lang) {
    var d = window.CB_I18N[lang] || (window.CB_I18N[lang] = {});
    Object.keys(add[lang]).forEach(function (k) { d[k] = add[lang][k]; });
  });
})();
