/* Peek A Boo Pic UI Flow - Terhubung ke Backend */
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

const startScreen = $("#startScreen");
const appScreen   = $("#appScreen");
const btnStart    = $("#btnStart");

const panelRail   = $("#panelRail");
const toggle      = $(".toggle");
const toggleBtns  = $$(".toggle__btn");

const appHeader   = $("#appHeader"); // <-- WAJIB ada di HTML

const uploadModal = $("#uploadModal");
const fileInput   = $("#fileInput");
const modalUploadBtn = $("#modalUploadBtn");

const resultEncrypt = $("#resultEncrypt");
const resultDecrypt = $("#resultDecrypt");

const btnEncrypt = $("#btnEncrypt");
const btnDecrypt = $("#btnDecrypt");
const btnDownloadStego   = $("#btnDownloadStego");
const btnDownloadExtract = $("#btnDownloadExtract");

const encryptKey = $("#encryptKey");
const decryptKey = $("#decryptKey");

const metaCover   = $("#metaCover");
const metaPayload = $("#metaPayload");
const metaStego   = $("#metaStego");

const previewCover   = $("#previewCover");
const previewPayload = $("#previewPayload");
const previewStego   = $("#previewStego");

let currentUploadTarget = null;
const state = {
  cover: null,    // foto asli
  payload: null,  // foto penampung
  stego: null,    // foto stego (decrypt)
  generatedStegoBlob: null,
  extractedBlob: null
};

function show(el){
  if(!el) return;
  el.classList.remove("is-hidden");
  el.setAttribute("aria-hidden","false");
}
function hide(el){
  if(!el) return;
  el.classList.add("is-hidden");
  el.setAttribute("aria-hidden","true");
}

/* =========================
   NAV / VIEW HELPERS
========================= */
function setTab(tab){
  panelRail.dataset.view = tab;
  toggle.dataset.active = tab;
  toggleBtns.forEach(btn => btn.classList.toggle("is-active", btn.dataset.tab === tab));
}

function goToApp(){
  hide(startScreen);
  show(appScreen);
  setTab("encrypt");
  exitResultMode(); // pastikan mode normal
}

function enterResultMode(){
  // body class dipakai untuk CSS hide header
  document.body.classList.add("is-result");

  // sembunyikan panel utama
  hide($(".panel-wrap"));

  // sembunyikan header (judul + subtitle + toggle)
  hide(appHeader);

  // pastikan hanya 1 result yang tampil
  hide(resultEncrypt);
  hide(resultDecrypt);
}

function exitResultMode(){
  document.body.classList.remove("is-result");

  // tampilkan panel utama + header
  show($(".panel-wrap"));
  show(appHeader);

  // sembunyikan result
  hide(resultEncrypt);
  hide(resultDecrypt);
}

/* =========================
   EVENTS: START + TOGGLE
========================= */
btnStart?.addEventListener("click", goToApp);

toggleBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    // kalau lagi mode result, jangan bisa pindah tab
    if(document.body.classList.contains("is-result")) return;
    setTab(btn.dataset.tab);
  });
});

/* =========================
   UPLOAD MODAL
========================= */
$$("[data-open-modal]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    currentUploadTarget = btn.dataset.openModal;
    openModal();
  });
});

$$("[data-close-modal]").forEach(el => el.addEventListener("click", closeModal));

function openModal(){
  fileInput.value = "";
  show(uploadModal);
}

function closeModal(){
  hide(uploadModal);
  currentUploadTarget = null;
}

modalUploadBtn?.addEventListener("click", ()=> fileInput.click());
$(".modal__drop")?.addEventListener("click", ()=> fileInput.click());

fileInput?.addEventListener("change", e=>{
  const file = e.target.files?.[0];
  if(!file || !currentUploadTarget) return;
  if(!file.type.startsWith("image/")) return alert("File harus gambar JPG/PNG");

  state[currentUploadTarget] = file;
  renderFileMeta(currentUploadTarget, file);
  closeModal();
});

function renderFileMeta(target, file){
  const url = URL.createObjectURL(file);

  if(target==="cover"){
    metaCover.textContent = file.name;
    previewCover.src = url;
    previewCover.classList.remove("is-hidden");
  } else if(target==="payload"){
    metaPayload.textContent = file.name;
    previewPayload.src = url;
    previewPayload.classList.remove("is-hidden");
  } else if(target==="stego"){
    metaStego.textContent = file.name;
    previewStego.src = url;
    previewStego.classList.remove("is-hidden");
  }
}

/* =========================
   ENCRYPT
========================= */
btnEncrypt?.addEventListener("click", async ()=>{
  if(!state.cover || !state.payload) return alert("Upload Foto Asli & Penampung dulu");
  if(!encryptKey.value.trim()) return alert("Secret key wajib diisi");

  const fd = new FormData();
  // sesuaikan nama field dengan backend
  fd.append("original", state.cover);
  fd.append("cover", state.payload);
  fd.append("secret_key", encryptKey.value.trim());

  try{
    const r = await fetch("/api/encrypt", { method:"POST", body: fd });
    const j = await r.json();
    if(!j.ok) throw new Error(j.error || "Encrypt gagal");

    // masuk mode hasil + tampilkan result encrypt
    enterResultMode();
    show(resultEncrypt);

    if(j.download_url){
      btnDownloadStego.onclick = ()=> (location.href = j.download_url);
    }

    // preview stego (kalau backend ngirim base64 data url)
    if(j.preview?.startsWith("data:image")){
      previewPayload.src = j.preview;
      previewPayload.classList.remove("is-hidden");
    }
  }catch(err){
    alert(err.message);
  }
});

/* =========================
   DECRYPT
========================= */
btnDecrypt?.addEventListener("click", async ()=>{
  if(!state.stego) return alert("Upload Foto Stego dulu");
  if(!decryptKey.value.trim()) return alert("Secret key wajib diisi");

  const fd = new FormData();
  fd.append("stego", state.stego);
  fd.append("secret_key", decryptKey.value.trim());

  try{
    const r = await fetch("/api/decrypt", { method:"POST", body: fd });
    const j = await r.json();
    if(!j.ok) throw new Error(j.error || "Decrypt gagal");

    // masuk mode hasil + tampilkan result decrypt
    enterResultMode();
    show(resultDecrypt);

    if(j.download_url){
      btnDownloadExtract.onclick = ()=> (location.href = j.download_url);
    }

    // preview hasil ekstrak (kalau backend ngirim base64 data url)
    if(j.preview?.startsWith("data:image")){
      previewStego.src = j.preview;
      previewStego.classList.remove("is-hidden");
    }
  }catch(err){
    alert(err.message);
  }
});

/* =========================
   BACK BUTTONS
========================= */
$$("[data-back='app']").forEach(btn=>{
  btn.addEventListener("click", ()=> exitResultMode());
});

/* =========================
   DRAG & DROP
========================= */
["cover","payload","stego"].forEach(target=>{
  const card = document.querySelector(`[data-uploader="${target}"]`);
  if(!card) return;

  card.addEventListener("dragover", e=>{
    e.preventDefault();
    card.style.outline = "2px dashed rgba(255,255,255,.35)";
    card.style.outlineOffset = "4px";
  });

  card.addEventListener("dragleave", ()=>{
    card.style.outline = "none";
  });

  card.addEventListener("drop", e=>{
    e.preventDefault();
    card.style.outline = "none";

    const file = e.dataTransfer.files?.[0];
    if(!file || !file.type.startsWith("image/")) return alert("File harus gambar");

    state[target] = file;
    renderFileMeta(target, file);
  });
});
