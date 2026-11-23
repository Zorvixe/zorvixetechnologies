import React from 'react';
import './PayslipModal.css';

export default function PayslipModal({ payslipData, onClose }) {
  if (!payslipData) return null;

  const {
    employee_name,
    employee_code,
    department,
    position,
    joining_date,
    bank_name,
    bank_account_no,
    bank_ifsc,
    pan_number,
    uan_number,
    esi_number,
    monthName,
    year,
    working_days,
    paid_days,
    unpaid_days,
    earnings = [],
    deductions = [],
    gross_earnings,
    total_deductions,
    net_salary,
    netPayInWords,
    payment_mode,
    payment_date,
    company = {}
  } = payslipData;

  const handlePrint = () => {
    window.print();
  };

  const fmtCurrency = (val) => {
    return `₹${Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="payslip-modal-backdrop" onClick={onClose}>
      <div className="payslip-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header Actions - hidden in print */}
        <div className="payslip-modal-actions no-print">
          <div className="payslip-modal-title">
            <span>Payslip Preview</span>
            <span className="payslip-month-tag">{monthName} {year}</span>
          </div>
          <div className="payslip-action-buttons">
            <button className="btn-payslip-print" onClick={handlePrint} title="Print or Save as PDF">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
              <span>Print / Save PDF</span>
            </button>
            <button className="btn-payslip-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>

        {/* Printable Document Paper */}
        <div className="payslip-paper printable-content">
          {/* Company Header */}
          <div className="payslip-company-header">
            <div className="payslip-brand">
              <h1 className="company-name">{company.name || 'ZORVIXE TECHNOLOGIES'}</h1>
              <p className="company-tagline">{company.tagline || 'Enterprise Software & Cloud Engineering Solutions'}</p>
              <p className="company-address">{company.address || 'Hyderabad, Telangana, India'}</p>
              <p className="company-meta">Email: {company.email || 'info@zorvixetechnologies.in'} | Web: {company.website || 'www.zorvixetechnologies.in'}</p>
            </div>
            <div className="payslip-title-box">
              <div className="payslip-heading">SALARY PAYSLIP</div>
              <div className="payslip-period">{monthName?.toUpperCase()} {year}</div>
            </div>
          </div>

          <div className="payslip-divider" />

          {/* Employee & Attendance Grid */}
          <div className="payslip-meta-grid">
            <div className="meta-col">
              <div className="meta-row"><span className="meta-label">Employee ID:</span> <span className="meta-val highlight">{employee_code || 'ZOR-EMP-001'}</span></div>
              <div className="meta-row"><span className="meta-label">Employee Name:</span> <span className="meta-val bold">{employee_name}</span></div>
              <div className="meta-row"><span className="meta-label">Designation:</span> <span className="meta-val">{position || 'Software Engineer'}</span></div>
              <div className="meta-row"><span className="meta-label">Department:</span> <span className="meta-val">{department || 'Engineering'}</span></div>
              <div className="meta-row"><span className="meta-label">Date of Joining:</span> <span className="meta-val">{joining_date ? new Date(joining_date).toLocaleDateString() : 'N/A'}</span></div>
            </div>

            <div className="meta-col">
              <div className="meta-row"><span className="meta-label">Bank Name:</span> <span className="meta-val">{bank_name || 'HDFC Bank'}</span></div>
              <div className="meta-row"><span className="meta-label">Bank A/C No:</span> <span className="meta-val">{bank_account_no ? `•••• •••• ${String(bank_account_no).slice(-4)}` : 'N/A'}</span></div>
              <div className="meta-row"><span className="meta-label">IFSC Code:</span> <span className="meta-val">{bank_ifsc || 'N/A'}</span></div>
              <div className="meta-row"><span className="meta-label">PAN Number:</span> <span className="meta-val">{pan_number || 'N/A'}</span></div>
              <div className="meta-row"><span className="meta-label">PF / UAN No:</span> <span className="meta-val">{uan_number || 'N/A'}</span></div>
              <div className="meta-row"><span className="meta-label">ESIC No:</span> <span className="meta-val">{esi_number || 'N/A'}</span></div>
            </div>

            <div className="meta-col meta-attendance">
              <div className="attendance-box">
                <div className="att-title">ATTENDANCE SUMMARY</div>
                <div className="att-row"><span>Total Days:</span> <strong>{working_days || 30}</strong></div>
                <div className="att-row"><span>Days Payable:</span> <strong className="text-success">{paid_days || 30}</strong></div>
                <div className="att-row"><span>Loss of Pay (LOP):</span> <strong className="text-danger">{unpaid_days || 0}</strong></div>
                <div className="att-row"><span>Payment Mode:</span> <strong>{payment_mode || 'Bank Transfer'}</strong></div>
                <div className="att-row"><span>Pay Date:</span> <strong>{payment_date ? new Date(payment_date).toLocaleDateString() : 'N/A'}</strong></div>
              </div>
            </div>
          </div>

          {/* Earnings & Deductions Table */}
          <div className="payslip-table-wrapper">
            <div className="payslip-col-table">
              <div className="table-header-band earnings-band">
                <span>EARNINGS</span>
                <span>AMOUNT</span>
              </div>
              <div className="table-rows">
                {earnings.map((e, idx) => (
                  <div className="table-data-row" key={idx}>
                    <span className="row-title">{e.name}</span>
                    <span className="row-amount">{fmtCurrency(e.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="table-subtotal-row earnings-total">
                <span>TOTAL GROSS EARNINGS</span>
                <span>{fmtCurrency(gross_earnings)}</span>
              </div>
            </div>

            <div className="payslip-col-table">
              <div className="table-header-band deductions-band">
                <span>DEDUCTIONS</span>
                <span>AMOUNT</span>
              </div>
              <div className="table-rows">
                {deductions.map((d, idx) => (
                  <div className="table-data-row" key={idx}>
                    <span className="row-title">{d.name}</span>
                    <span className="row-amount">{fmtCurrency(d.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="table-subtotal-row deductions-total">
                <span>TOTAL DEDUCTIONS</span>
                <span>{fmtCurrency(total_deductions)}</span>
              </div>
            </div>
          </div>

          {/* Net Salary Highlight Box */}
          <div className="payslip-net-box">
            <div className="net-left">
              <div className="net-label">NET TAKE-HOME SALARY</div>
              <div className="net-words">In Words: <em>{netPayInWords}</em></div>
            </div>
            <div className="net-amount">{fmtCurrency(net_salary)}</div>
          </div>

          {/* Signatures & Footer */}
          <div className="payslip-signatures">
            <div className="sign-block">
              <div className="sign-line" />
              <div className="sign-label">Employee Signature</div>
            </div>

            <div className="sign-block">
              <div className="stamp-box">
                <div className="stamp-circle">ZORVIXE HR</div>
              </div>
              <div className="sign-line" />
              <div className="sign-label">Authorized Signatory</div>
              <div className="sign-sub">Zorvixe Technologies HR Dept</div>
            </div>
          </div>

          <div className="payslip-disclaimer">
            * This is a computer-generated payslip authorized by Zorvixe Technologies and does not require a physical signature if validated online.
          </div>
        </div>
      </div>
    </div>
  );
}
