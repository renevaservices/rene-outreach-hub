// Fills the database with FICTIONAL sample businesses so the prototype has something to show.
// Websites and emails use the reserved ".example" domain, which can never belong to a real
// company, and phone numbers are obviously fake. Nothing here is real prospect data.
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { openDatabase } from './db.js';

// [business, industry, city, province, source, status, contact, role, note]
const SAMPLE = [
  ['Bluegum Dental Studio', 'Dental', 'Pretoria', 'Gauteng', 'Website directory', 'new', 'Thandi Mokoena', 'Practice Manager', 'Busy front desk; may need admin help.'],
  ['Karoo Legal Partners', 'Legal', 'Bloemfontein', 'Free State', 'Referral', 'contacted', 'Pieter van Wyk', 'Office Manager', 'Referred by a sample client.'],
  ['Harbour View Estates', 'Real estate', 'Cape Town', 'Western Cape', 'LinkedIn', 'replied', 'Aisha Davids', 'Agency Principal', 'Asked for pricing.'],
  ['Ironwood Accounting', 'Accounting', 'Johannesburg', 'Gauteng', 'Networking event', 'follow_up', 'Sipho Ndlovu', 'Managing Partner', 'Follow up after tax season.'],
  ['Sunbird Physio & Rehab', 'Health', 'Durban', 'KwaZulu-Natal', 'Website directory', 'new', 'Naledi Khumalo', 'Practice Owner', ''],
  ['Marula Print House', 'Printing', 'Pretoria', 'Gauteng', 'Manual entry', 'not_interested', 'Johan Botha', 'Owner', 'Said they handle admin in-house.'],
  ['Tidewater Travel Co', 'Travel', 'Port Elizabeth', 'Eastern Cape', 'LinkedIn', 'contacted', 'Lerato Dlamini', 'Operations Lead', ''],
  ['Fynbos Interiors', 'Design', 'Cape Town', 'Western Cape', 'Referral', 'new', 'Megan Fortuin', 'Studio Director', 'Lots of client emails to manage.'],
  ['Granite Peak Construction', 'Construction', 'Johannesburg', 'Gauteng', 'Website directory', 'new', 'Kabelo Sithole', 'Site Administrator', ''],
  ['Lantern Lane Bookkeeping', 'Accounting', 'Polokwane', 'Limpopo', 'Networking event', 'replied', 'Zanele Mahlangu', 'Owner', 'Wants a call next week.'],
  ['Baobab Wellness Spa', 'Health', 'Nelspruit', 'Mpumalanga', 'Manual entry', 'follow_up', 'Refilwe Molefe', 'Manager', 'Follow up on proposal.'],
  ['Copperfield Law Chambers', 'Legal', 'Durban', 'KwaZulu-Natal', 'LinkedIn', 'do_not_contact', 'Imran Patel', 'Senior Partner', 'Asked to be removed from outreach.'],
  ['Savanna Solar Installers', 'Energy', 'Pretoria', 'Gauteng', 'Website directory', 'contacted', 'Thabo Radebe', 'Sales Manager', ''],
  ['Rooibos Coffee Roasters', 'Food & beverage', 'Stellenbosch', 'Western Cape', 'Referral', 'new', 'Elaine Joubert', 'Owner', 'Online orders growing fast.'],
  ['Summit Safety Training', 'Training', 'Johannesburg', 'Gauteng', 'Networking event', 'new', 'Mandla Zulu', 'Director', ''],
  ['Acacia Pre-School Group', 'Education', 'Centurion', 'Gauteng', 'Manual entry', 'contacted', 'Busisiwe Nkosi', 'Group Administrator', ''],
  ['Driftwood Marketing Lab', 'Marketing', 'Cape Town', 'Western Cape', 'LinkedIn', 'replied', 'Craig Williams', 'Founder', 'Interested in monthly retainer.'],
  ['Proteus Medical Billing', 'Health', 'Pretoria', 'Gauteng', 'Website directory', 'new', 'Nomsa Cele', 'Billing Lead', ''],
  ['Quartz Fleet Services', 'Logistics', 'Durban', 'KwaZulu-Natal', 'Manual entry', 'not_interested', 'Rudi Pretorius', 'Operations Manager', 'No budget this year.'],
  ['Silverleaf Wedding Planners', 'Events', 'Johannesburg', 'Gauteng', 'Referral', 'follow_up', 'Tshepiso Maseko', 'Lead Planner', 'Peak season starts soon.'],
  ['Kudu Creek Veterinary', 'Veterinary', 'Bloemfontein', 'Free State', 'Website directory', 'new', 'Annelie Smit', 'Practice Manager', ''],
  ['Orchard Road Pharmacy', 'Health', 'Pretoria', 'Gauteng', 'Manual entry', 'contacted', 'Yusuf Moosa', 'Pharmacist-in-Charge', ''],
  ['Westbridge Property Management', 'Real estate', 'Cape Town', 'Western Cape', 'LinkedIn', 'new', 'Candice Arendse', 'Portfolio Manager', 'Many tenant queries by email.'],
  ['Lighthouse IT Support', 'Technology', 'Durban', 'KwaZulu-Natal', 'Networking event', 'replied', 'Senzo Mthembu', 'Owner', 'Needs help with invoicing admin.'],
];

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function emailLocal(fullName) {
  return fullName.toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/\s+/g, '.');
}

/**
 * Adds the sample businesses once. Returns how many were added (0 if already done).
 * A flag in the "meta" table stops them being added a second time, even if you delete some.
 */
export function seedSampleData(db, { force = false } = {}) {
  const done = db.prepare("SELECT value FROM meta WHERE key = 'sample_seeded'").get();
  if (done && !force) return 0;

  const insertProspect = db.prepare(
    `INSERT INTO prospects (business_name, website, industry, city, province, source, status, notes, is_sample)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
  );
  const insertContact = db.prepare(
    `INSERT INTO contacts (prospect_id, full_name, role, email, phone, is_primary)
     VALUES (?, ?, ?, ?, ?, 1)`
  );

  db.exec('BEGIN');
  try {
    if (force) db.exec('DELETE FROM prospects WHERE is_sample = 1');
    SAMPLE.forEach((row, index) => {
      const [name, industry, city, province, source, status, contact, role, note] = row;
      const slug = slugify(name);
      const note2 = note ? `${note} (Fictional sample business.)` : 'Fictional sample business.';
      const { lastInsertRowid } = insertProspect.run(
        name, `https://${slug}.example`, industry, city, province, source, status, note2
      );
      insertContact.run(
        lastInsertRowid,
        contact,
        role,
        `${emailLocal(contact)}@${slug}.example`,
        `+27 00 000 ${String(1001 + index)}`
      );
    });
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('sample_seeded', '1')").run();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return SAMPLE.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  const force = process.argv.includes('--reset');
  const added = seedSampleData(db, { force });
  console.log(
    added > 0
      ? `Added ${added} fictional sample businesses.`
      : 'Sample data was already added. Use "npm run seed -- --reset" to rebuild it.'
  );
}
