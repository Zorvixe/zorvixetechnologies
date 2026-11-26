import React, { useState, useEffect, useCallback } from 'react';
import {
  apiListQuotes,
  apiGetQuote,
  apiCreateQuote,
  apiUpdateQuoteStatus,
  apiDeleteQuote,
  apiListProducts,
  apiCreateProduct,
  apiListAccounts,
  apiListDeals
} from '../../api';
import SendEmailModal from './SendEmailModal';
import RichTextEditor from '../../components/RichTextEditor';
import { renderSafeHtml } from '../../utils/safeHtml';
import {
  PackageIcon,
  BriefcaseIcon,
  EyeIcon,
  TrashIcon,
  PrinterIcon,
  FileTextIcon
} from '../../components/CrmHrmsIcons';
import './QuotesTab.css';

export default function QuotesTab() {
  const [quotes, setQuotes] = useState([]);
  const [products, setProducts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  // Send Email Modal State
  const [emailModalConfig, setEmailModalConfig] = useState({
    isOpen: false,
    recipient: {},
    relatedType: 'quote',
    relatedId: null
  });

  // Manage Products Modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    code: '',
    name: '',
    category: 'Software',
    unit_price: 50000,
    tax_percentage: 18.0,
    description: ''
  });
  const [savingProduct, setSavingProduct] = useState(false);

  // Create Quote Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [quoteForm, setQuoteForm] = useState({
    subject: '',
    client_id: '',
    deal_id: '',
    valid_until: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
    discount_percentage: 0,
    terms_and_conditions: 'Standard Zorvixe Technologies terms: 50% advance, 50% upon milestone delivery. GST extra as applicable.',
    notes: '',
    items: [
      { product_id: '', description: '', quantity: 1, unit_price: 100000, discount_percentage: 0, tax_percentage: 18.0 }
    ]
  });
  const [savingQuote, setSavingQuote] = useState(false);

  // Preview / Print Quote Modal
  const [previewQuoteData, setPreviewQuoteData] = useState(null);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiListQuotes();
      setQuotes(res.quotes || []);
    } catch (err) {
      console.error('Failed to load quotes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDropdownData = useCallback(async () => {
    try {
      const [prodRes, accRes, dealsRes] = await Promise.all([
        apiListProducts(),
        apiListAccounts(),
        apiListDeals()
      ]);
      setProducts(prodRes.products || []);
      setAccounts(accRes.accounts || []);
      setDeals(dealsRes.deals || []);
    } catch (err) {
      console.error('Failed to load quote dependencies:', err);
    }
  }, []);

  useEffect(() => {
    fetchQuotes();
    fetchDropdownData();
  }, [fetchQuotes, fetchDropdownData]);

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!newProductForm.code || !newProductForm.name) return alert('Code and Name are required');
    setSavingProduct(true);
    try {
      await apiCreateProduct(newProductForm);
      alert('Product added to catalog!');
      setNewProductForm({
        code: '',
        name: '',
        category: 'Software',
        unit_price: 50000,
        tax_percentage: 18.0,
        description: ''
      });
      fetchDropdownData();
    } catch (err) {
      alert(err.message || 'Failed to add product');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleLineItemChange = (index, field, value) => {
    const updated = [...quoteForm.items];
    updated[index][field] = value;

    if (field === 'product_id' && value) {
      const p = products.find(prod => String(prod.id) === String(value));
      if (p) {
        updated[index].description = p.name;
        updated[index].unit_price = Number(p.unit_price);
        updated[index].tax_percentage = Number(p.tax_percentage);
      }
    }
    setQuoteForm({ ...quoteForm, items: updated });
  };

  const addLineItem = () => {
    setQuoteForm({
      ...quoteForm,
      items: [
        ...quoteForm.items,
        { product_id: '', description: '', quantity: 1, unit_price: 50000, discount_percentage: 0, tax_percentage: 18.0 }
      ]
    });
  };

  const removeLineItem = (index) => {
    if (quoteForm.items.length === 1) return;
    const updated = quoteForm.items.filter((_, idx) => idx !== index);
    setQuoteForm({ ...quoteForm, items: updated });
  };

  // Computations for create form
  const calculateTotals = () => {
    let subtotal = 0;
    let totalTax = 0;
    quoteForm.items.forEach(it => {
      const q = Number(it.quantity || 1);
      const pr = Number(it.unit_price || 0);
      const disc = Number(it.discount_percentage || 0);
      const taxRate = Number(it.tax_percentage || 18.0);
      const base = q * pr;
      const afterDisc = base - (base * (disc / 100));
      const lineTax = afterDisc * (taxRate / 100);
      subtotal += afterDisc;
      totalTax += lineTax;
    });
    const discAmount = subtotal * (Number(quoteForm.discount_percentage || 0) / 100);
    const grandTotal = Math.round((subtotal - discAmount + totalTax) * 100) / 100;
    return { subtotal, discAmount, totalTax, grandTotal };
  };

  const formTotals = calculateTotals();

  const handleCreateQuote = async (e) => {
    e.preventDefault();
    if (!quoteForm.subject || !quoteForm.client_id) return alert('Subject and Client are required');
    setSavingQuote(true);
    try {
      await apiCreateQuote(quoteForm);
      alert('Quotation generated successfully!');
      setShowCreateModal(false);
      setQuoteForm({
        subject: '',
        client_id: '',
        deal_id: '',
        valid_until: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
        discount_percentage: 0,
        terms_and_conditions: 'Standard Zorvixe Technologies terms: 50% advance, 50% upon milestone delivery. GST extra as applicable.',
        notes: '',
        items: [
          { product_id: '', description: '', quantity: 1, unit_price: 100000, discount_percentage: 0, tax_percentage: 18.0 }
        ]
      });
      fetchQuotes();
    } catch (err) {
      alert(err.message || 'Failed to create quote');
    } finally {
      setSavingQuote(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await apiUpdateQuoteStatus(id, status);
      fetchQuotes();
    } catch (err) {
      alert(err.message || 'Failed to update quote status');
    }
  };

  const handleDeleteQuote = async (id) => {
    if (!window.confirm('Delete this quotation?')) return;
    try {
      await apiDeleteQuote(id);
      fetchQuotes();
    } catch (err) {
      alert(err.message || 'Failed to delete quote');
    }
  };

  const openPreview = async (id) => {
    setPreviewQuoteData(null);
    try {
      const res = await apiGetQuote(id);
      setPreviewQuoteData(res);
    } catch (err) {
      alert(err.message || 'Failed to load quote details');
    }
  };

  const fmtCurrency = (val) => val ? `₹${Number(val).toLocaleString('en-IN')}` : '₹0';

  return (
    <div className="crm-quotes-tab">
      {/* Top Controls */}
      <div className="quotes-filter-bar">
        <div>
          <h3 className="quotes-heading">Quotations & Price Book (CPQ)</h3>
          <p className="quotes-sub">Generate itemized quotes, manage product pricing, and send client proposals</p>
        </div>

        <div className="quotes-action-btns">
          <button className="btn-manage-products" onClick={() => setShowProductModal(true)}>
            <PackageIcon size={14} style={{ marginRight: '6px' }} />
            Products Catalog ({products.length})
          </button>
          <button className="btn-create-quote" onClick={() => setShowCreateModal(true)}>
            + Create Quotation
          </button>
        </div>
      </div>

      {/* Quotes Table */}
      <div className="quotes-table-container">
        <table className="quotes-table">
          <thead>
            <tr>
              <th>Quote #</th>
              <th>Subject & Client</th>
              <th>Linked Opportunity</th>
              <th>Grand Total</th>
              <th>Status</th>
              <th>Valid Until</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <div className="loader_container">
                  <p className="loader_spinner"></p>
                  <p>Loading quotations...</p>
                </div>
              </tr>
            ) : quotes.length === 0 ? (
              <tr>
                <td colSpan="7" className="table-state-msg">No quotations generated yet. Click "+ Create Quotation" to issue your first proposal.</td>
              </tr>
            ) : (
              quotes.map((q) => (
                <tr key={q.id}>
                  <td>
                    <span className="quote-number-tag">{q.quote_number}</span>
                  </td>
                  <td>
                    <div className="quote-subject"><strong>{q.subject}</strong></div>
                    <div className="quote-client-sub">{q.client_company || q.client_name}</div>
                  </td>
                  <td>
                    {q.deal_title ? (
                      <span className="deal-ref">
                        <BriefcaseIcon size={12} style={{ marginRight: '4px' }} />
                        {q.deal_title}
                      </span>
                    ) : '--'}
                  </td>
                  <td>
                    <strong className="text-success quote-amount">{fmtCurrency(q.grand_total)}</strong>
                    <div className="tax-sub-text">Incl. 18% GST</div>
                  </td>
                  <td>
                    <select
                      value={q.status}
                      onChange={(e) => handleStatusChange(q.id, e.target.value)}
                      className={`status-select status-${q.status}`}
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="negotiating">Negotiating</option>
                      <option value="accepted">Accepted</option>
                      <option value="declined">Declined</option>
                    </select>
                  </td>
                  <td>
                    <span className="valid-date">{q.valid_until ? new Date(q.valid_until).toLocaleDateString() : '--'}</span>
                  </td>
                  <td>
                    <div className="quote-row-actions">
                      <button className="btn-preview-quote" onClick={() => openPreview(q.id)}>
                        <EyeIcon size={13} style={{ marginRight: '4px' }} />
                        View / Print
                      </button>
                      <button
                        className="btn-delete-icon"
                        onClick={() => setEmailModalConfig({
                          isOpen: true,
                          recipient: {
                            email: q.client_email,
                            name: q.client_name,
                            company: q.client_company || q.client_name,
                            quoteNumber: q.quote_number,
                            amount: q.grand_total,
                            category: 'proposal'
                          },
                          relatedType: 'quote',
                          relatedId: q.id
                        })}
                        title="Email Proposal to Client"
                      >
                        <FileTextIcon size={13} />
                      </button>
                      <button className="btn-delete-icon" onClick={() => handleDeleteQuote(q.id)} title="Delete Quote">
                        <TrashIcon size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE QUOTATION MODAL */}
      {showCreateModal && (
        <div className="crm-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="crm-modal-card crm-modal-xl" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h4>Generate Official Quotation Proposal</h4>
              <button type="button" className="crm-modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateQuote} className="crm-modal-form">
              <div className="crm-form-row">
                <div className="crm-form-group">
                  <label>Quotation Subject *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Enterprise Custom SaaS Development & Cloud Architecture"
                    value={quoteForm.subject}
                    onChange={(e) => setQuoteForm({ ...quoteForm, subject: e.target.value })}
                  />
                </div>
                <div className="crm-form-group">
                  <label>Client Account *</label>
                  <select
                    required
                    value={quoteForm.client_id}
                    onChange={(e) => setQuoteForm({ ...quoteForm, client_id: e.target.value })}
                  >
                    <option value="">-- Select Client Account --</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.company || acc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="crm-form-row">
                <div className="crm-form-group">
                  <label>Linked Deal (Optional)</label>
                  <select
                    value={quoteForm.deal_id}
                    onChange={(e) => setQuoteForm({ ...quoteForm, deal_id: e.target.value })}
                  >
                    <option value="">-- Select Opportunity in Pipeline --</option>
                    {deals.map(d => (
                      <option key={d.id} value={d.id}>{d.title} ({fmtCurrency(d.value)})</option>
                    ))}
                  </select>
                </div>
                <div className="crm-form-group">
                  <label>Valid Until</label>
                  <input
                    type="date"
                    value={quoteForm.valid_until}
                    onChange={(e) => setQuoteForm({ ...quoteForm, valid_until: e.target.value })}
                  />
                </div>
              </div>

              {/* Dynamic Line Items Section */}
              <div className="quote-items-section">
                <div className="line-items-header">
                  <h5>Itemized Products & Services</h5>
                  <button type="button" className="btn-add-line" onClick={addLineItem}>
                    + Add Product Line Item
                  </button>
                </div>

                <div className="line-items-table-wrap">
                  <table className="line-items-table">
                    <thead>
                      <tr>
                        <th style={{ width: '25%' }}>Catalog Product</th>
                        <th style={{ width: '30%' }}>Description</th>
                        <th style={{ width: '10%' }}>Qty</th>
                        <th style={{ width: '15%' }}>Rate (₹)</th>
                        <th style={{ width: '10%' }}>Disc %</th>
                        <th style={{ width: '10%' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quoteForm.items.map((it, idx) => (
                        <tr key={idx}>
                          <td>
                            <select
                              value={it.product_id}
                              onChange={(e) => handleLineItemChange(idx, 'product_id', e.target.value)}
                              className="table-input-select"
                            >
                              <option value="">-- Choose Product --</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.code}: {p.name}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              type="text"
                              placeholder="Description"
                              value={it.description}
                              onChange={(e) => handleLineItemChange(idx, 'description', e.target.value)}
                              className="table-input-text"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              value={it.quantity}
                              onChange={(e) => handleLineItemChange(idx, 'quantity', e.target.value)}
                              className="table-input-number"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={it.unit_price}
                              onChange={(e) => handleLineItemChange(idx, 'unit_price', e.target.value)}
                              className="table-input-number"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={it.discount_percentage}
                              onChange={(e) => handleLineItemChange(idx, 'discount_percentage', e.target.value)}
                              className="table-input-number"
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn-remove-line"
                              onClick={() => removeLineItem(idx)}
                              disabled={quoteForm.items.length === 1}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Calculation Summary */}
                <div className="quote-calc-summary">
                  <div className="calc-row">
                    <span>Subtotal:</span>
                    <strong>{fmtCurrency(formTotals.subtotal)}</strong>
                  </div>
                  <div className="calc-row">
                    <span>GST Tax (18%):</span>
                    <strong>{fmtCurrency(formTotals.totalTax)}</strong>
                  </div>
                  <div className="calc-row grand-total-row">
                    <span>Grand Total:</span>
                    <strong className="text-success">{fmtCurrency(formTotals.grandTotal)}</strong>
                  </div>
                </div>
              </div>

              <div className="crm-form-group">
                <label>Terms & Conditions</label>
                <RichTextEditor
                  value={quoteForm.terms_and_conditions}
                  placeholder="Specify payment terms, validity, and taxes..."
                  minHeight="90px"
                  aiFieldLabel="Quotation Terms & Conditions"
                  onChange={(content) => setQuoteForm({ ...quoteForm, terms_and_conditions: content })}
                />
              </div>

              <div className="crm-modal-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn-modal-submit" disabled={savingQuote}>
                  {savingQuote ? 'Creating...' : 'Issue Quotation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRODUCTS CATALOG MODAL */}
      {showProductModal && (
        <div className="crm-modal-backdrop" onClick={() => setShowProductModal(false)}>
          <div className="crm-modal-card crm-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h4>Products & Services Catalog (Price Book)</h4>
              <button type="button" className="crm-modal-close" onClick={() => setShowProductModal(false)}>×</button>
            </div>
            <div className="crm-modal-form">
              {/* Add Product Form */}
              <form onSubmit={handleCreateProduct} className="add-product-inline-box">
                <h5>+ Add New Product to Price Book</h5>
                <div className="crm-form-row">
                  <input
                    type="text"
                    required
                    placeholder="Product SKU / Code (e.g. PROD-MOBILE-APP)"
                    value={newProductForm.code}
                    onChange={(e) => setNewProductForm({ ...newProductForm, code: e.target.value })}
                  />
                  <input
                    type="text"
                    required
                    placeholder="Product / Service Name"
                    value={newProductForm.name}
                    onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })}
                  />
                </div>
                <div className="crm-form-row">
                  <select
                    value={newProductForm.category}
                    onChange={(e) => setNewProductForm({ ...newProductForm, category: e.target.value })}
                  >
                    <option value="Software">Software</option>
                    <option value="Service">Service</option>
                    <option value="Consulting">Consulting</option>
                    <option value="Maintenance">Annual Maintenance</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Unit Price (₹)"
                    value={newProductForm.unit_price}
                    onChange={(e) => setNewProductForm({ ...newProductForm, unit_price: e.target.value })}
                  />
                </div>
                <button type="submit" className="btn-add-product-submit" disabled={savingProduct}>
                  {savingProduct ? 'Saving...' : 'Save Product into Catalog'}
                </button>
              </form>

              {/* Products List */}
              <div className="catalog-list">
                <h5>Current Price Catalog</h5>
                <table className="catalog-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Tax %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p.id}>
                        <td><strong>{p.code}</strong></td>
                        <td>{p.name}</td>
                        <td><span className="cat-pill">{p.category}</span></td>
                        <td><strong>{fmtCurrency(p.unit_price)}</strong></td>
                        <td>{p.tax_percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRINTABLE QUOTE PREVIEW MODAL */}
      {previewQuoteData && (
        <div className="crm-modal-backdrop" onClick={() => setPreviewQuoteData(null)}>
          <div className="crm-modal-card crm-modal-xl" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header no-print">
              <h4>Quotation: {previewQuoteData.quote?.quote_number}</h4>
              <div className="preview-top-actions">
                <button
                  type="button"
                  className="btn-print-quote"
                  style={{ background: '#0052cc', color: '#ffffff' }}
                  onClick={() => setEmailModalConfig({
                    isOpen: true,
                    recipient: {
                      email: previewQuoteData.quote?.client_email,
                      name: previewQuoteData.quote?.client_name,
                      company: previewQuoteData.quote?.client_company || previewQuoteData.quote?.client_name,
                      quoteNumber: previewQuoteData.quote?.quote_number,
                      amount: previewQuoteData.quote?.grand_total,
                      category: 'proposal'
                    },
                    relatedType: 'quote',
                    relatedId: previewQuoteData.quote?.id
                  })}
                >
                  ✉️ Email Proposal
                </button>
                <button type="button" className="btn-print-quote" onClick={() => window.print()}>
                  <PrinterIcon size={14} style={{ marginRight: '6px' }} />
                  Print / Download PDF
                </button>
                <button type="button" className="crm-modal-close" onClick={() => setPreviewQuoteData(null)}>×</button>
              </div>
            </div>
            <div className="printable-quote-body">
              {/* Document Header */}
              <div className="quote-doc-header">
                <div>
                  <h2 className="company-branding">Zorvixe Technologies</h2>
                  <p className="company-meta">
                    Enterprise Software Architecture, Cloud & Automation<br />
                    Bengaluru, Karnataka, India • contact@zorvixe.com
                  </p>
                </div>
                <div className="quote-doc-meta">
                  <h3 className="doc-type-title">COMMERCIAL PROPOSAL</h3>
                  <div className="meta-line"><span>Quote #:</span> <strong>{previewQuoteData.quote?.quote_number}</strong></div>
                  <div className="meta-line"><span>Date:</span> <strong>{new Date(previewQuoteData.quote?.created_at).toLocaleDateString()}</strong></div>
                  <div className="meta-line"><span>Valid Until:</span> <strong>{new Date(previewQuoteData.quote?.valid_until).toLocaleDateString()}</strong></div>
                  <div className="meta-line"><span>Status:</span> <span className="doc-status">{previewQuoteData.quote?.status?.toUpperCase()}</span></div>
                </div>
              </div>

              {/* Bill to block */}
              <div className="bill-to-block">
                <h5>Proposal Prepared For:</h5>
                <h4>{previewQuoteData.quote?.client_company || previewQuoteData.quote?.client_name}</h4>
                <p>Email: {previewQuoteData.quote?.client_email} • Phone: {previewQuoteData.quote?.client_phone}</p>
                <p>Subject: <strong>{previewQuoteData.quote?.subject}</strong></p>
              </div>

              {/* Items Table */}
              <table className="doc-items-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item Description</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th>Disc %</th>
                    <th>Tax</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {previewQuoteData.items?.map((it, idx) => (
                    <tr key={it.id || idx}>
                      <td>{idx + 1}</td>
                      <td><strong>{it.description}</strong></td>
                      <td>{it.quantity}</td>
                      <td>{fmtCurrency(it.unit_price)}</td>
                      <td>{it.discount_percentage}%</td>
                      <td>{it.tax_percentage}%</td>
                      <td><strong>{fmtCurrency(it.total_amount)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="doc-totals-box">
                <div className="doc-total-row">
                  <span>Subtotal:</span>
                  <strong>{fmtCurrency(previewQuoteData.quote?.subtotal)}</strong>
                </div>
                <div className="doc-total-row">
                  <span>GST (18%):</span>
                  <strong>{fmtCurrency(previewQuoteData.quote?.tax_amount)}</strong>
                </div>
                <div className="doc-total-row grand-row">
                  <span>Grand Total (INR):</span>
                  <strong>{fmtCurrency(previewQuoteData.quote?.grand_total)}</strong>
                </div>
              </div>

              {/* Terms */}
              <div className="doc-terms">
                <h5>Terms & Conditions:</h5>
                <div dangerouslySetInnerHTML={{ __html: renderSafeHtml(previewQuoteData.quote?.terms_and_conditions) }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 2: SEND EMAIL MODAL */}
      <SendEmailModal
        isOpen={emailModalConfig.isOpen}
        onClose={() => setEmailModalConfig({ ...emailModalConfig, isOpen: false })}
        defaultRecipient={emailModalConfig.recipient}
        relatedType={emailModalConfig.relatedType}
        relatedId={emailModalConfig.relatedId}
      />
    </div>
  );
}
