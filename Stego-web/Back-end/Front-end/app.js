/* Peek A Boo Pic UI Flow - Terhubung ke Backend */
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

const startScreen = $("#startScreen");
const appScreen   = $("#appScreen");
const btnStart    = $("#btnStart");
const panelRail   = $("#panelRail");
const toggle      = $(".toggle");
const toggleBtns  = $$(".toggle__btn");

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

function show(el){ el.classList.remove("is-hidden"); el.setAttribute("aria-hidden","false"); }
function hide(el){ el.classList.add("is-hidden"); el.setAttribute("aria-hidden","true"); }

function goToApp(){
  hide(startScreen);
  show(appScreen);
  setTab("encrypt");
  showMainPanels();
}
function showMainPanels(){
  hide(resultEncrypt);
  hide(resultDecrypt);
}
function setTab(tab){
  panelRail.dataset.view = tab;
  toggle.dataset.active = tab;
  toggleBtns.forEach(btn => btn.classList.toggle("is-active", btn.dataset.tab === tab));
}

btnStart.addEventListener("click", goToApp);
toggleBtns.forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

/* === UPLOAD MODAL === */
$$("[data-open-modal]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    currentUploadTarget = btn.dataset.openModal;
    openModal();
  });
});
$$("[data-close-modal]").forEach(el=>el.addEventListener("click", closeModal));
function openModal(){ fileInput.value=""; show(uploadModal); }
function closeModal(){ hide(uploadModal); currentUploadTarget=null; }

modalUploadBtn.addEventListener("click", ()=> fileInput.click());
$(".modal__drop").addEventListener("click", ()=> fileInput.click());

fileInput.addEventListener("change", e=>{
  const file = e.target.files?.[0];
  if(!file || !currentUploadTarget) return;
  if(!file.type.startsWith("image/")) return alert("File harus gambar JPG/PNG");
  state[currentUploadTarget] = file;
  renderFileMeta(currentUploadTarget, file);
  closeModal();
});

function renderFileMeta(target,file){
  const url = URL.createObjectURL(file);
  if(target==="cover"){ metaCover.textContent=file.name; previewCover.src=url; previewCover.classList.remove("is-hidden"); }
  else if(target==="payload"){ metaPayload.textContent=file.name; previewPayload.src=url; previewPayload.classList.remove("is-hidden"); }
  else if(target==="stego"){ metaStego.textContent=file.name; previewStego.src=url; previewStego.classList.remove("is-hidden"); }
}

/* === ENCRYPT === */
btnEncrypt.addEventListener("click", async ()=>{
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

    // tampilkan hasil
    hideMainAppPanelsButKeepHeader();
    show(resultEncrypt);
    if(j.download_url){
      btnDownloadStego.onclick = ()=> location.href=j.download_url;
    }
    if(j.preview?.startsWith("data:image")){
      previewPayload.src = j.preview; // update preview jadi stego
    }
  }catch(err){
    alert(err.message);
  }
});

/* === DECRYPT === */
btnDecrypt.addEventListener("click", async ()=>{
  if(!state.stego) return alert("Upload Foto Stego dulu");
  if(!decryptKey.value.trim()) return alert("Secret key wajib diisi");

  const fd = new FormData();
  fd.append("stego", state.stego);
  fd.append("secret_key", decryptKey.value.trim());

  try{
    const r = await fetch("/api/decrypt", { method:"POST", body: fd });
    const j = await r.json();
    if(!j.ok) throw new Error(j.error || "Decrypt gagal");

    hideMainAppPanelsButKeepHeader();
    show(resultDecrypt);

    if(j.download_url){
      btnDownloadExtract.onclick = ()=> location.href=j.download_url;
    }
    if(j.preview?.startsWith("data:image")){
      previewStego.src = j.preview;
      previewStego.classList.remove("is-hidden");
    }
  }catch(err){
    alert(err.message);
  }
});

/* === Helper Navigasi === */
function hideMainAppPanelsButKeepHeader(){
  $(".panel-wrap").classList.add("is-hidden");
}
function showMainFromResult(){
  $(".panel-wrap").classList.remove("is-hidden");
  showMainPanels();
}
$$("[data-back='app']").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    hide(resultEncrypt); hide(resultDecrypt);
    showMainFromResult();
  });
});

/* === Drag & Drop === */
["cover","payload","stego"].forEach(target=>{
  const card = document.querySelector(`[data-uploader="${target}"]`);
  if(!card) return;
  card.addEventListener("dragover", e=>{
    e.preventDefault();
    card.style.outline="2px dashed rgba(255,255,255,.35)";
    card.style.outlineOffset="4px";
  });
  card.addEventListener("dragleave", ()=> card.style.outline="none");
  card.addEventListener("drop", e=>{
    e.preventDefault(); card.style.outline="none";
    const file = e.dataTransfer.files?.[0];
    if(!file || !file.type.startsWith("image/")) return alert("File harus gambar");
    state[target] = file;
    renderFileMeta(target,file);
  });
});