// client side scripts for booking, finding, admin quick actions and scanning

async function postFormData(url, formEl) {
  const formData = new FormData(formEl);
  const res = await fetch(url, { method: 'POST', body: formData });
  return res.json();
}

document.getElementById('bookForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Sending...';
  try {
    const json = await postFormData('/api/book', e.target);
    document.getElementById('bookResult').innerHTML = `<strong>Booking ID:</strong> ${json.id} <br> Please wait for admin verification. Use UTR to retrieve ticket.`;
    e.target.reset();
  } catch (err) {
    document.getElementById('bookResult').textContent = 'Error submitting';
  } finally { btn.disabled = false; btn.textContent = 'Submit Booking (200 Rs)'; }
});

// find by UTR
document.getElementById('findForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const utr = e.target.utr.value.trim();
  const res = await fetch('/api/find?utr=' + encodeURIComponent(utr));
  const box = document.getElementById('findResult');
  if (!res.ok) { box.textContent = 'Not found'; return; }
  const json = await res.json();
  const ticketRes = await fetch('/api/ticket/' + json.id);
  const ticket = await ticketRes.json();
  box.innerHTML = `<div class="ticket"><img src="${ticket.qr}" alt="qr"><div><strong>${ticket.name}</strong><br>Mobile: ${ticket.mobile}<br>UTR: ${ticket.utr}<br>Status: ${ticket.status}<br><button onclick="downloadTicket('${ticket.id}')">Download Ticket</button> <button onclick="shareWhatsApp('${ticket.id}')">Share via WhatsApp</button></div></div>`;
});

async function downloadTicket(id){
  const res = await fetch('/api/ticket/'+id+'/download');
  if (!res.ok) return alert('Unable to fetch ticket');
  const json = await res.json();
  // open a new window with ticket content and let user save image
  const w = window.open('about:blank','ticket');
  w.document.write(`<h2>Swarnkar Garba Mahotsav 2026</h2><p>Name: ${json.ticket.name}</p><p>Mobile: ${json.ticket.mobile}</p><p>UTR: ${json.ticket.utr}</p><img src="${json.ticket.qr}" alt="qr"><p>Max 4 members per QR. Status: ${json.ticket.status}</p>`);
}

function shareWhatsApp(id){
  const url = location.origin + '/api/ticket/'+id;
  const text = encodeURIComponent('Your Swarnkar Garba Mahotsav 2026 ticket: ' + url);
  window.open('https://api.whatsapp.com/send?text=' + text,'_blank');
}

// Scanner (simple text-based input)
window.scan = async function(){
  const txt = document.getElementById('scanText').value.trim();
  let id = txt;
  // try parse JSON payload in case QR contains JSON
  try{ const p = JSON.parse(txt); if (p.id) id = p.id; }
  catch(e){}
  const count = prompt('Number of members entering (1-4):', '1');
  if (!count) return;
  const res = await fetch('/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scannerPassword:'admin',id,count})});
  const box = document.getElementById('findResult');
  if (!res.ok) { const j = await res.json(); alert('Error: '+(j.error||'')); return; }
  const j = await res.json(); alert('Accepted. Remaining entries: ' + j.remaining);
}

