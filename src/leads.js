/**
 * Lead Capture and Management for Rosa 2.0
 * Stores customer data for CRM and follow-up
 */

const fs = require('fs');
const path = require('path');

// Store leads in memory and optionally in JSON file
const leads = new Map();
const LEADS_FILE = path.join(__dirname, '../data/leads.json');

/**
 * Lead object structure
 */
class Lead {
  constructor(phoneNumber, name, email, phone = null) {
    this.id = `lead_${phoneNumber}_${Date.now()}`;
    this.phoneNumber = phoneNumber;
    this.name = name;
    this.email = email;
    this.phone = phone || phoneNumber;
    this.capturedAt = new Date().toISOString();
    this.source = 'WhatsApp';
    this.status = 'new'; // new, contacted, converted, lost
    this.tags = [];
    this.interactionCount = 0;
    this.lastInteraction = this.capturedAt;
    this.purchaseHistory = [];
    this.totalSpent = 0;
    this.notes = [];
  }

  /**
   * Update lead status
   */
  setStatus(status) {
    const validStatuses = ['new', 'contacted', 'converted', 'lost'];
    if (validStatuses.includes(status)) {
      this.status = status;
      this.addNote(`Status alterado para: ${status}`);
    }
  }

  /**
   * Add tag to lead
   */
  addTag(tag) {
    if (!this.tags.includes(tag)) {
      this.tags.push(tag);
    }
  }

  /**
   * Record interaction
   */
  recordInteraction() {
    this.interactionCount++;
    this.lastInteraction = new Date().toISOString();
  }

  /**
   * Add purchase to history
   */
  addPurchase(productName, amount) {
    this.purchaseHistory.push({
      product: productName,
      amount,
      date: new Date().toISOString()
    });
    this.totalSpent += amount;
    this.status = 'converted';
  }

  /**
   * Add note
   */
  addNote(note) {
    this.notes.push({
      text: note,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get lead summary
   */
  getSummary() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      phone: this.phone,
      status: this.status,
      capturedAt: this.capturedAt,
      lastInteraction: this.lastInteraction,
      interactions: this.interactionCount,
      purchases: this.purchaseHistory.length,
      totalSpent: this.totalSpent,
      tags: this.tags
    };
  }
}

/**
 * Capture lead from customer data
 */
function captureLead(phoneNumber, name, email, phone = null) {
  // Check if lead already exists
  const existingLead = Array.from(leads.values()).find(
    l => l.phoneNumber === phoneNumber
  );

  if (existingLead) {
    // Update existing lead
    if (name) existingLead.name = name;
    if (email) existingLead.email = email;
    if (phone) existingLead.phone = phone;
    existingLead.recordInteraction();
    saveLead(existingLead);
    return {
      success: true,
      message: `â Dados atualizados para ${name}`,
      isNew: false,
      lead: existingLead
    };
  }

  // Create new lead
  const lead = new Lead(phoneNumber, name, email, phone);
  leads.set(lead.id, lead);
  saveLead(lead);

  return {
    success: true,
    message: `â Bem-vindo(a) ${name}! Seus dados foram salvos.`,
    isNew: true,
    lead: lead
  };
}

/**
 * Get lead by phone number
 */
function getLeadByPhone(phoneNumber) {
  return Array.from(leads.values()).find(l => l.phoneNumber === phoneNumber) || null;
}

/**
 * Get lead by ID
 */
function getLeadById(leadId) {
  return leads.get(leadId) || null;
}

/**
 * Get all leads
 */
function getAllLeads() {
  return Array.from(leads.values());
}

/**
 * Get leads by status
 */
function getLeadsByStatus(status) {
  return Array.from(leads.values()).filter(l => l.status === status);
}

/**
 * Search leads
 */
function searchLeads(query) {
  const q = query.toLowerCase();
  return Array.from(leads.values()).filter(l =>
    l.name.toLowerCase().includes(q) ||
    l.email.toLowerCase().includes(q) ||
    l.phoneNumber.includes(q)
  );
}

/**
 * Update lead
 */
function updateLead(leadId, data) {
  const lead = leads.get(leadId);
  if (!lead) {
    return { success: false, error: 'Lead nÃ£o encontrado' };
  }

  if (data.name) lead.name = data.name;
  if (data.email) lead.email = data.email;
  if (data.phone) lead.phone = data.phone;
  if (data.status) lead.setStatus(data.status);
  if (data.tags) data.tags.forEach(tag => lead.addTag(tag));
  if (data.notes) data.notes.forEach(note => lead.addNote(note));

  saveLead(lead);
  return { success: true, lead };
}

/**
 * Record purchase for lead
 */
function recordPurchase(leadId, productName, amount) {
  const lead = leads.get(leadId);
  if (!lead) {
    return { success: false, error: 'Lead nÃ£o encontrado' };
  }

  lead.addPurchase(productName, amount);
  lead.addNote(`Compra registrada: ${productName} - R$ ${amount.toFixed(2)}`);
  saveLead(lead);

  return { success: true, lead };
}

/**
 * Get lead statistics
 */
function getLeadStats() {
  const allLeads = getAllLeads();
  const converted = getLeadsByStatus('converted');
  const totalRevenue = converted.reduce((sum, l) => sum + l.totalSpent, 0);

  return {
    totalLeads: allLeads.length,
    newLeads: getLeadsByStatus('new').length,
    contactedLeads: getLeadsByStatus('contacted').length,
    convertedLeads: converted.length,
    lostLeads: getLeadsByStatus('lost').length,
    conversionRate: allLeads.length > 0 ? (converted.length / allLeads.length * 100).toFixed(2) : 0,
    totalRevenue: totalRevenue.toFixed(2),
    averageOrderValue: converted.length > 0 ? (totalRevenue / converted.length).toFixed(2) : 0,
    totalInteractions: allLeads.reduce((sum, l) => sum + l.interactionCount, 0)
  };
}

/**
 * Export leads to JSON
 */
function exportLeads() {
  const allLeads = getAllLeads().map(l => l.getSummary());
  return allLeads;
}

/**
 * Save lead to file (for persistence)
 */
function saveLead(lead) {
  try {
    // Ensure data directory exists
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Read existing leads
    let existingLeads = [];
    if (fs.existsSync(LEADS_FILE)) {
      const content = fs.readFileSync(LEADS_FILE, 'utf8');
      existingLeads = JSON.parse(content);
    }

    // Update or add lead
    const index = existingLeads.findIndex(l => l.id === lead.id);
    if (index >= 0) {
      existingLeads[index] = lead;
    } else {
      existingLeads.push(lead);
    }

    // Write back
    fs.writeFileSync(LEADS_FILE, JSON.stringify(existingLeads, null, 2));
  } catch (error) {
    console.error('[Leads] Erro ao salvar lead:', error.message);
  }
}

/**
 * Load leads from file
 */
function loadLeads() {
  try {
    if (!fs.existsSync(LEADS_FILE)) {
      return;
    }

    const content = fs.readFileSync(LEADS_FILE, 'utf8');
    const leadsData = JSON.parse(content);

    leadsData.forEach(data => {
      const lead = Object.assign(new Lead(), data);
      leads.set(lead.id, lead);
    });

    console.log(`[Leads] Carregados ${leadsData.length} leads do arquivo`);
  } catch (error) {
    console.error('[Leads] Erro ao carregar leads:', error.message);
  }
}

/**
 * Delete lead
 */
function deleteLead(leadId) {
  return leads.delete(leadId);
}

/**
 * Clear all leads
 */
function clearAllLeads() {
  const count = leads.size;
  leads.clear();
  return count;
}

// Load leads on startup
loadLeads();

module.exports = {
  Lead,
  captureLead,
  getLeadByPhone,
  getLeadById,
  getAllLeads,
  getLeadsByStatus,
  searchLeads,
  updateLead,
  recordPurchase,
  getLeadStats,
  exportLeads,
  saveLead,
  loadLeads,
  deleteLead,
  clearAllLeads
};
