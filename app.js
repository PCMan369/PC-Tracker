import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, getDocs 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ⚠️ PASTE YOUR FIREBASE CONFIG KEYS HERE ⚠️
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  highlightNav();

  if (page === 'inventory') initInventory();
  if (page === 'expenses') initExpenses();
  if (page === 'pcs') initPCs();
  if (page === 'sales') initSales();
});

function highlightNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav a').forEach(link => {
    if (link.getAttribute('href') === path || (path === '' && link.getAttribute('href') === 'index.html')) {
      link.classList.add('active');
    }
  });
}

/* --- INVENTORY --- */
function initInventory() {
  const form = document.getElementById('inventory-form');
  const tbody = document.getElementById('inventory-tbody');

  onSnapshot(collection(db, "inventory"), (snapshot) => {
    tbody.innerHTML = snapshot.empty 
      ? `<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">No parts in inventory yet.</td></tr>`
      : snapshot.docs.map(docSnap => {
          const item = docSnap.data();
          const badgeClass = item.status === 'In Stock' ? 'badge-in-stock' : 'badge-testing';
          return `
            <tr>
              <td><strong>${item.name}</strong></td>
              <td>${item.category}</td>
              <td>${formatCurrency(item.cost)}</td>
              <td><span class="badge ${badgeClass}">${item.status}</span></td>
              <td><button class="btn btn-danger" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="deleteInventory('${docSnap.id}')">Delete</button></td>
            </tr>
          `;
        }).join('');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "inventory"), {
      name: document.getElementById('part-name').value,
      category: document.getElementById('part-category').value,
      cost: parseFloat(document.getElementById('part-cost').value),
      status: 'In Stock'
    });
    form.reset();
  });

  window.deleteInventory = async (id) => {
    await deleteDoc(doc(db, "inventory", id));
  };
}

/* --- EXPENSES --- */
function initExpenses() {
  const form = document.getElementById('expense-form');
  const tbody = document.getElementById('expense-tbody');
  const totalEl = document.getElementById('total-expenses');

  onSnapshot(collection(db, "expenses"), (snapshot) => {
    let total = 0;
    tbody.innerHTML = snapshot.empty 
      ? `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No expenses recorded.</td></tr>`
      : snapshot.docs.map(docSnap => {
          const item = docSnap.data();
          total += item.amount || 0;
          return `
            <tr>
              <td><strong>${item.description}</strong></td>
              <td>${item.category}</td>
              <td>${formatCurrency(item.amount)}</td>
              <td><button class="btn btn-danger" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="deleteExpense('${docSnap.id}')">Delete</button></td>
            </tr>
          `;
        }).join('');
    totalEl.textContent = formatCurrency(total);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "expenses"), {
      description: document.getElementById('exp-desc').value,
      category: document.getElementById('exp-cat').value,
      amount: parseFloat(document.getElementById('exp-amount').value)
    });
    form.reset();
  });

  window.deleteExpense = async (id) => {
    await deleteDoc(doc(db, "expenses", id));
  };
}

/* --- BUILT PCS & INVENTORY BUILDER --- */
function initPCs() {
  const form = document.getElementById('pc-form');
  const container = document.getElementById('pcs-grid');
  const costInput = document.getElementById('pc-cost');

  // Category mapping for dropdown selectors
  const categories = ['CPU', 'GPU', 'RAM', 'Storage', 'Motherboard', 'PSU', 'Case'];
  
  // Populate Parts Dropdowns from Inventory
  onSnapshot(collection(db, "inventory"), (snapshot) => {
    const inStockParts = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.status === 'In Stock');

    categories.forEach(cat => {
      const selectId = `select-${cat === 'Motherboard' ? 'mobo' : cat.toLowerCase()}`;
      const selectEl = document.getElementById(selectId);
      if (!selectEl) return;

      const currentVal = selectEl.value;
      const catParts = inStockParts.filter(p => p.category === cat);

      selectEl.innerHTML = `<option value="" data-cost="0">-- Manual / None --</option>` +
        catParts.map(p => `<option value="${p.id}" data-cost="${p.cost}" data-name="${p.name}">${p.name} ($${p.cost})</option>`).join('');
      
      selectEl.value = currentVal;
    });
  });

  // Calculate total build cost dynamically when picking parts
  document.querySelectorAll('.part-select').forEach(select => {
    select.addEventListener('change', recalculateBuildCost);
  });

  function recalculateBuildCost() {
    let total = 0;
    document.querySelectorAll('.part-select').forEach(select => {
      const selectedOption = select.options[select.selectedIndex];
      if (selectedOption && selectedOption.dataset.cost) {
        total += parseFloat(selectedOption.dataset.cost) || 0;
      }
    });
    costInput.value = total.toFixed(2);
  }

  // Display PCs
  onSnapshot(collection(db, "pcs"), (snapshot) => {
    container.innerHTML = snapshot.empty
      ? `<div class="card" style="grid-column: 1/-1; text-align:center; color: var(--text-muted);">No active PC builds found.</div>`
      : snapshot.docs.map(docSnap => {
          const pc = docSnap.data();
          const id = docSnap.id;
          return `
            <div class="card">
              <div style="display:flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.8rem;">
                <h3>${pc.name}</h3>
                <span class="badge badge-${pc.status.toLowerCase()}">${pc.status}</span>
              </div>
              <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem; white-space: pre-line;">${pc.specs}</p>
              <div style="margin-bottom: 1.2rem; font-size: 0.9rem;">
                <div><strong>Total Cost:</strong> ${formatCurrency(pc.cost)}</div>
                <div><strong>Target Price:</strong> ${formatCurrency(pc.targetPrice)}</div>
                <div><strong>Target Profit:</strong> ${formatCurrency(pc.targetPrice - pc.cost)}</div>
              </div>
              <div style="display:flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
                <select onchange="updatePCStatus('${id}', this.value)" style="padding: 0.4rem;">
                  <option value="Building" ${pc.status === 'Building' ? 'selected' : ''}>Building</option>
                  <option value="Testing" ${pc.status === 'Testing' ? 'selected' : ''}>Testing</option>
                  <option value="Listed" ${pc.status === 'Listed' ? 'selected' : ''}>Listed</option>
                </select>
                <button class="btn btn-success" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" onclick="markAsSold('${id}', '${pc.name}', \`${pc.specs}\`, ${pc.cost}, ${pc.targetPrice})">Mark Sold</button>
                <button class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.85rem; background:#475569; color:#fff;" onclick="copyListingText(\`${pc.name}\`, \`${pc.specs}\`, ${pc.targetPrice})">Copy Listing</button>
                <button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" onclick="deletePC('${id}')">Delete</button>
              </div>
            </div>
          `;
        }).join('');
  });

  // Submit New Build
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const specParts = [];
    const usedPartIds = [];

    // Gather specs and IDs from selected parts
    categories.forEach(cat => {
      const selectId = `select-${cat === 'Motherboard' ? 'mobo' : cat.toLowerCase()}`;
      const selectEl = document.getElementById(selectId);
      if (selectEl && selectEl.value) {
        const option = selectEl.options[selectEl.selectedIndex];
        specParts.push(`${cat}: ${option.dataset.name}`);
        usedPartIds.push(selectEl.value);
      }
    });

    const manualSpecs = document.getElementById('pc-manual-specs').value;
    if (manualSpecs) specParts.push(`Extras: ${manualSpecs}`);

    const pcName = document.getElementById('pc-name').value;

    // 1. Add PC Build doc
    await addDoc(collection(db, "pcs"), {
      name: pcName,
      specs: specParts.join(' | '),
      cost: parseFloat(costInput.value),
      targetPrice: parseFloat(document.getElementById('pc-target').value),
      status: 'Building'
    });

    // 2. Mark assigned inventory items as "Used in Build"
    for (const partId of usedPartIds) {
      await updateDoc(doc(db, "inventory", partId), {
        status: `Used in: ${pcName}`
      });
    }

    form.reset();
  });

  window.updatePCStatus = async (id, newStatus) => {
    await updateDoc(doc(db, "pcs", id), { status: newStatus });
  };

  // Mark Sold Logic
  window.markAsSold = async (id, name, specs, cost, targetPrice) => {
    const soldPriceInput = prompt(`Enter actual sale price for "${name}":`, targetPrice);
    if (soldPriceInput === null) return;

    const soldPrice = parseFloat(soldPriceInput) || 0;
    const profit = soldPrice - cost;

    await addDoc(collection(db, "sales"), {
      name: name,
      specs: specs,
      cost: cost,
      soldPrice: soldPrice,
      profit: profit,
      saleDate: new Date().toLocaleDateString()
    });

    await deleteDoc(doc(db, "pcs", id));
  };

  // Copy Facebook Marketplace / Craigslist Description
  window.copyListingText = (name, specs, price) => {
    const text = `🖥️ FOR SALE: ${name}\n💰 Price: ${formatCurrency(price)} (Cash / Venmo / Zelle)\n\nSPECS:\n${specs.split(' | ').join('\n')}\n\n✅ Fully tested, cleaned, and plug-and-play ready!\n📩 Message me if interested or if you have any questions!`;
    navigator.clipboard.writeText(text);
    alert('Listing description copied to clipboard!');
  };

  window.deletePC = async (id) => {
    await deleteDoc(doc(db, "pcs", id));
  };
}

/* --- SALES HISTORY --- */
function initSales() {
  const tbody = document.getElementById('sales-tbody');
  const totalRevenueEl = document.getElementById('total-revenue');
  const totalProfitEl = document.getElementById('total-profit');
  const avgProfitEl = document.getElementById('avg-profit');

  onSnapshot(collection(db, "sales"), (snapshot) => {
    let totalRev = 0;
    let totalProf = 0;
    const totalCount = snapshot.docs.length;

    tbody.innerHTML = snapshot.empty
      ? `<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">No sales recorded yet.</td></tr>`
      : snapshot.docs.map(docSnap => {
          const s = docSnap.data();
          totalRev += s.soldPrice || 0;
          totalProf += s.profit || 0;

          return `
            <tr>
              <td><strong>${s.name}</strong></td>
              <td>${s.specs}</td>
              <td>${formatCurrency(s.cost)}</td>
              <td>${formatCurrency(s.soldPrice)}</td>
              <td style="color: ${s.profit >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: bold;">
                ${s.profit >= 0 ? '+' : ''}${formatCurrency(s.profit)}
              </td>
              <td>${s.saleDate}</td>
            </tr>
          `;
        }).join('');

    totalRevenueEl.textContent = formatCurrency(totalRev);
    totalProfitEl.textContent = formatCurrency(totalProf);
    avgProfitEl.textContent = formatCurrency(totalCount > 0 ? totalProf / totalCount : 0);
  });
}
