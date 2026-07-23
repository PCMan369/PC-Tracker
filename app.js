// Import Firebase SDKs directly via Web Modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ⚠️ PASTE YOUR FIREBASE CONFIG KEYS HERE ⚠️
const firebaseConfig = {
  apiKey: "AIzaSyAn48Mut6wDehwhg_oQsU0BN6YCrEdsIIE",
  authDomain: "pc-tracker-55a5b.firebaseapp.com",
  databaseURL: "https://pc-tracker-55a5b-default-rtdb.firebaseio.com",
  projectId: "pc-tracker-55a5b",
  storageBucket: "pc-tracker-55a5b.firebasestorage.app",
  messagingSenderId: "524228442574",
  appId: "1:524228442574:web:8a653cd546fa83ee87d39f",
  measurementId: "G-FG1JB3PWMB"
};

// Initialize Cloud Database
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
}

// Global Nav & Page Router Initialization
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

/* --- INVENTORY (REALTIME CLOUD SYNC) --- */
function initInventory() {
  const form = document.getElementById('inventory-form');
  const tbody = document.getElementById('inventory-tbody');

  // Realtime Listener
  onSnapshot(collection(db, "inventory"), (snapshot) => {
    tbody.innerHTML = snapshot.empty 
      ? `<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">No parts in inventory yet.</td></tr>`
      : snapshot.docs.map(docSnap => {
          const item = docSnap.data();
          return `
            <tr>
              <td><strong>${item.name}</strong></td>
              <td>${item.category}</td>
              <td>${formatCurrency(item.cost)}</td>
              <td><span class="badge badge-in-stock">${item.status}</span></td>
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

/* --- EXPENSES (REALTIME CLOUD SYNC) --- */
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

/* --- BUILT PCS & AUTO-TRANSFER --- */
function initPCs() {
  const form = document.getElementById('pc-form');
  const container = document.getElementById('pcs-grid');

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
              <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">${pc.specs}</p>
              <div style="margin-bottom: 1.2rem; font-size: 0.9rem;">
                <div><strong>Total Cost:</strong> ${formatCurrency(pc.cost)}</div>
                <div><strong>Target Price:</strong> ${formatCurrency(pc.targetPrice)}</div>
              </div>
              <div style="display:flex; gap: 0.5rem; align-items: center;">
                <select onchange="updatePCStatus('${id}', this.value)" style="padding: 0.4rem;">
                  <option value="Building" ${pc.status === 'Building' ? 'selected' : ''}>Building</option>
                  <option value="Testing" ${pc.status === 'Testing' ? 'selected' : ''}>Testing</option>
                  <option value="Listed" ${pc.status === 'Listed' ? 'selected' : ''}>Listed</option>
                </select>
                <button class="btn btn-success" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" onclick="markAsSold('${id}', '${pc.name}', '${pc.specs}', ${pc.cost}, ${pc.targetPrice})">Mark Sold</button>
                <button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" onclick="deletePC('${id}')">Delete</button>
              </div>
            </div>
          `;
        }).join('');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "pcs"), {
      name: document.getElementById('pc-name').value,
      specs: document.getElementById('pc-specs').value,
      cost: parseFloat(document.getElementById('pc-cost').value),
      targetPrice: parseFloat(document.getElementById('pc-target').value),
      status: 'Building'
    });
    form.reset();
  });

  window.updatePCStatus = async (id, newStatus) => {
    await updateDoc(doc(db, "pcs", id), { status: newStatus });
  };

  // AUTO-MOVE PC TO SALES COLLECTION IN THE CLOUD
  window.markAsSold = async (id, name, specs, cost, targetPrice) => {
    const soldPriceInput = prompt(`Enter actual sale price for "${name}":`, targetPrice);
    if (soldPriceInput === null) return;

    const soldPrice = parseFloat(soldPriceInput) || 0;
    const profit = soldPrice - cost;

    // 1. Add to Cloud Sales collection
    await addDoc(collection(db, "sales"), {
      name: name,
      specs: specs,
      cost: cost,
      soldPrice: soldPrice,
      profit: profit,
      saleDate: new Date().toLocaleDateString()
    });

    // 2. Delete from active Cloud PCs collection
    await deleteDoc(doc(db, "pcs", id));
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
      ? `<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">No sales recorded yet. Mark PCs as sold to log them here.</td></tr>`
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
