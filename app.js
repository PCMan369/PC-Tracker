import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot 
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
  if (page === 'expenses') initMoneyTracker();
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

/* --- INVENTORY (SORTED BY CATEGORY -> COST) --- */
function initInventory() {
  const form = document.getElementById('inventory-form');
  const tbody = document.getElementById('inventory-tbody');

  onSnapshot(collection(db, "inventory"), (snapshot) => {
    if (snapshot.empty) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">No parts in inventory yet.</td></tr>`;
      return;
    }

    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // SORT logic: Category alphabetically -> Cost ascending
    items.sort((a, b) => {
      const catCompare = a.category.localeCompare(b.category);
      if (catCompare !== 0) return catCompare;
      return (a.cost || 0) - (b.cost || 0);
    });

    tbody.innerHTML = items.map(item => {
      const badgeClass = item.status === 'In Stock' ? 'badge-in-stock' : 'badge-testing';
      return `
        <tr>
          <td><span class="badge" style="background: var(--card-border); color: var(--text-main);">${item.category}</span></td>
          <td><strong>${item.name}</strong></td>
          <td>${formatCurrency(item.cost)}</td>
          <td><span class="badge ${badgeClass}">${item.status}</span></td>
          <td><button class="btn btn-danger" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="deleteInventory('${item.id}')">Delete</button></td>
        </tr>
      `;
    }).join('');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('part-name').value;
    const category = document.getElementById('part-category').value;
    const cost = parseFloat(document.getElementById('part-cost').value);

    // 1. Add Part to Inventory
    await addDoc(collection(db, "inventory"), {
      name, category, cost, status: 'In Stock'
    });

    // 2. AUTO-LOG TO MONEY TRACKER (Outflow)
    await addDoc(collection(db, "transactions"), {
      description: `Bought Part: ${category} - ${name}`,
      category: 'Parts Inventory',
      amount: -Math.abs(cost), // Negative amount for outflow
      type: 'Outflow',
      date: new Date().toLocaleDateString()
    });

    form.reset();
  });

  window.deleteInventory = async (id) => {
    await deleteDoc(doc(db, "inventory", id));
  };
}

/* --- MONEY TRACKER (CASH FLOW IN / OUT) --- */
function initMoneyTracker() {
  const form = document.getElementById('expense-form');
  const tbody = document.getElementById('expense-tbody');
  const inflowEl = document.getElementById('total-inflow');
  const outflowEl = document.getElementById('total-outflow');
  const netEl = document.getElementById('net-balance');

  onSnapshot(collection(db, "transactions"), (snapshot) => {
    let totalIn = 0;
    let totalOut = 0;

    tbody.innerHTML = snapshot.empty 
      ? `<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">No transactions recorded.</td></tr>`
      : snapshot.docs.map(docSnap => {
          const item = docSnap.data();
          const amt = item.amount || 0;

          if (amt >= 0) totalIn += amt;
          else totalOut += Math.abs(amt);

          const isPositive = amt >= 0;
          return `
            <tr>
              <td>${item.date || 'N/A'}</td>
              <td><strong>${item.description}</strong></td>
              <td><span class="badge ${isPositive ? 'badge-inflow' : 'badge-outflow'}">${isPositive ? 'Inflow (+)' : 'Outflow (-)'}</span></td>
              <td style="color: ${isPositive ? 'var(--success)' : 'var(--danger)'}; font-weight: bold;">
                ${isPositive ? '+' : ''}${formatCurrency(amt)}
              </td>
              <td><button class="btn btn-danger" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="deleteTransaction('${docSnap.id}')">Delete</button></td>
            </tr>
          `;
        }).join('');

    const net = totalIn - totalOut;
    inflowEl.textContent = formatCurrency(totalIn);
    outflowEl.textContent = formatCurrency(totalOut);
    netEl.textContent = formatCurrency(net);
    netEl.style.color = net >= 0 ? 'var(--success)' : 'var(--danger)';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const desc = document.getElementById('exp-desc').value;
    const cat = document.getElementById('exp-cat').value;
    const amount = parseFloat(document.getElementById('exp-amount').value);

    await addDoc(collection(db, "transactions"), {
      description: `${cat}: ${desc}`,
      category: cat,
      amount: -Math.abs(amount), // General expense outflow
      type: 'Outflow',
      date: new Date().toLocaleDateString()
    });

    form.reset();
  });

  window.deleteTransaction = async (id) => {
    await deleteDoc(doc(db, "transactions", id));
  };
}

/* --- BUILT PCS & DAYS ON MARKET --- */
function initPCs() {
  const form = document.getElementById('pc-form');
  const container = document.getElementById('pcs-grid');
  const costInput = document.getElementById('pc-cost');
  const categories = ['CPU', 'GPU', 'RAM', 'Storage', 'Motherboard', 'PSU', 'Case'];

  // Dynamic dropdowns
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

  document.querySelectorAll('.part-select').forEach(select => {
    select.addEventListener('change', () => {
      let total = 0;
      document
