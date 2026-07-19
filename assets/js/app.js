import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBHiKfeOS7Oz25OQX37wlFkZCTztyPQG-M",
  authDomain: "sepeda-bambang.firebaseapp.com",
  projectId: "sepeda-bambang",
  storageBucket: "sepeda-bambang.firebasestorage.app",
  messagingSenderId: "332125864139",
  appId: "1:332125864139:web:3b439f30a4340907335b4e",
  measurementId: "G-3H379DD9G4",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentUser = null;
let targetOffice = null;
let map = null;
let userMarker = null;
let officeCircle = null;
let base64Foto = "";
let userLat = 0;
let userLon = 0;
let insideRadius = false;
let nextAttendanceType = "pergi";
let todayAttendanceCount = 0;
let attendanceLocked = false;
let swipeReady = false;
let pingTimer = null;

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const capturedImg = document.getElementById("captured-photo");

function showLoading(show) {
  document.getElementById("loading-overlay").className = show ? "" : "hidden";
}

function hideSplash() {
  const splash = document.getElementById("native-splash");
  if (!splash) return;
  setTimeout(() => splash.classList.add("hidden-splash"), 650);
}

function safeText(value, fallback = "-") {
  return value || fallback;
}

function getDisplayName(user) {
  return user.nama || user.namaLengkap || user.username || "User";
}

function getTodayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getOfficeCoords() {
  if (!targetOffice) return null;
  const lat = Number(targetOffice.lat ?? targetOffice.latitude);
  const lon = Number(targetOffice.lon ?? targetOffice.lng ?? targetOffice.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function setElementText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

window.showModernModal = (title, message, type = "info") => {
  const box = document.getElementById("alert-icon-box");
  const icon = document.getElementById("alert-icon");

  setElementText("alert-title", title);
  setElementText("alert-desc", message);

  if (type === "error") {
    box.className = "modal-icon bg-red-50 text-red-600";
    icon.setAttribute("data-lucide", "x-circle");
  } else if (type === "warning") {
    box.className = "modal-icon bg-amber-50 text-amber-600";
    icon.setAttribute("data-lucide", "alert-triangle");
  } else {
    box.className = "modal-icon bg-blue-50 text-blue-600";
    icon.setAttribute("data-lucide", "info");
  }

  lucide.createIcons();
  document.getElementById("alert-modal").className = "";
};

window.closeAlertModal = () => {
  document.getElementById("alert-modal").className = "hidden";
};

window.closeSuccessModal = () => {
  document.getElementById("success-modal").className = "hidden";
  window.switchTab("riwayat");
};

function initPingChecker() {
  if (pingTimer) return;
  const runPing = () => {
    const start = Date.now();
    fetch("https://www.gstatic.com/generate_204", {
      mode: "no-cors",
      cache: "no-cache",
    })
      .then(() => {
        const ping = Date.now() - start;
        const el = document.getElementById("ping-text");
        el.innerText = `${ping} ms`;
        el.className = ping < 150 ? "text-emerald-600" : "text-amber-600";
      })
      .catch(() => {
        const el = document.getElementById("ping-text");
        el.innerText = "Offline";
        el.className = "text-red-500";
      });
  };

  runPing();
  pingTimer = setInterval(runPing, 5000);
}

async function checkPersistentSession() {
  const savedUser = localStorage.getItem("sepeda_abang_session");
  if (!savedUser) {
    hideSplash();
    return;
  }

  try {
    await mountUserData(JSON.parse(savedUser));
  } catch (e) {
    localStorage.removeItem("sepeda_abang_session");
    hideSplash();
  }
}

async function mountUserData(userObj) {
  currentUser = userObj;
  document.getElementById("login-screen").classList.add("hidden");

  const name = getDisplayName(currentUser);
  const firstLetter = name.charAt(0).toUpperCase();
  setElementText("user-initial", firstLetter);
  setElementText("profil-avatar", firstLetter);
  setElementText("user-display-name", name);
  setElementText("prof-nama", name);
  setElementText("prof-jabatan", safeText(currentUser.jabatan));
  setElementText("prof-shift", safeText(currentUser.shift, "Reguler"));
  setElementText("prof-user", safeText(currentUser.username));
  setElementText("dash-jabatan", safeText(currentUser.jabatan));
  setElementText("dash-shift", safeText(currentUser.shift, "Reguler"));

  await loadOfficeData();
  await fetchUserHistory();
  await fetchBroadcasts();

  startLiveTrackingAndMap();
  initCamera();
  initSwipeButton();
  initPingChecker();
  updateTodayAttendanceUI();
  hideSplash();
  lucide.createIcons();
}

async function loadOfficeData() {
  if (!currentUser?.desaId) {
    setElementText("prof-desa", "Kecamatan");
    setElementText("dash-desa", "Kecamatan");
    return;
  }

  const oSnap = await getDoc(doc(db, "desas", currentUser.desaId));
  if (oSnap.exists()) {
    targetOffice = oSnap.data();
    const name = targetOffice.namaDesa || targetOffice.nama || "Wilayah Tugas";
    setElementText("prof-desa", name);
    setElementText("dash-desa", name);
  }
}

window.handleUserLogin = async () => {
  showLoading(true);
  const username = document.getElementById("log-user").value.trim();
  const password = document.getElementById("log-pass").value;

  if (!username || !password) {
    showLoading(false);
    return window.showModernModal("Lengkapi Login", "Username dan password wajib diisi.", "warning");
  }

  try {
    const snap = await getDocs(
      query(collection(db, "users"), where("username", "==", username)),
    );

    if (snap.empty) {
      showLoading(false);
      return window.showModernModal("Gagal Masuk", "Username tidak ditemukan.", "error");
    }

    let userFound = null;
    snap.forEach((d) => {
      userFound = { id: d.id, ...d.data() };
    });

    if (userFound.password !== password) {
      showLoading(false);
      return window.showModernModal("Gagal Masuk", "Password salah.", "error");
    }

    localStorage.setItem("sepeda_abang_session", JSON.stringify(userFound));
    await mountUserData(userFound);
  } catch (err) {
    window.showModernModal("Koneksi Eror", "Gagal memproses validasi login.", "error");
  } finally {
    showLoading(false);
  }
};

window.handleLogout = () => {
  localStorage.removeItem("sepeda_abang_session");
  location.reload();
};

window.switchTab = (tabId) => {
  document.querySelectorAll(".tab-content").forEach((el) => {
    el.classList.remove("block");
    el.classList.add("hidden");
  });

  const tab = document.getElementById(`tab-${tabId}`);
  if (tab) {
    tab.classList.remove("hidden");
    tab.classList.add("block");
  }

  document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.remove("nav-active"));
  const targetNav = document.getElementById(`nav-${tabId}`);
  if (targetNav) targetNav.classList.add("nav-active");

  if (tabId === "absen-sheet") {
    updateTodayAttendanceUI();
    if (map) {
      setTimeout(() => {
        map.invalidateSize();
        const office = getOfficeCoords();
        if (userLat && userLon && office) {
          const bounds = L.latLngBounds([
            [userLat, userLon],
            [office.lat, office.lon],
          ]);
          map.fitBounds(bounds, { padding: [35, 35] });
        }
      }, 150);
    }
  }

  lucide.createIcons();
};

function startLiveTrackingAndMap() {
  if (!navigator.geolocation) {
    setGpsStatusDisplay("Tidak Support", "error");
    return;
  }

  if (!map) {
    map = L.map("user-map", { zoomControl: false }).setView([-3.4412, 104.5422], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
    userMarker = L.marker([-3.4412, 104.5422]).addTo(map);

    const office = getOfficeCoords();
    if (office) {
      officeCircle = L.circle([office.lat, office.lon], {
        radius: targetOffice.radius || 150,
        color: "#2563eb",
        fillColor: "#2563eb",
        fillOpacity: 0.15,
      }).addTo(map);
    }
  }

  setGpsStatusDisplay("Mencari Sinyal", "warning");

  navigator.geolocation.watchPosition(
    (pos) => {
      userLat = pos.coords.latitude;
      userLon = pos.coords.longitude;
      userMarker.setLatLng([userLat, userLon]);
      setGpsStatusDisplay("GPS Aktif", "success");

      const office = getOfficeCoords();
      if (!office) {
        insideRadius = false;
        setDistanceBadge("Lokasi Kantor Belum Ada", "warning");
        evaluateSwipeRequirement();
        return;
      }

      const dist = getDistance(userLat, userLon, office.lat, office.lon);
      const limit = targetOffice.radius || 150;

      if (dist <= limit) {
        insideRadius = true;
        setDistanceBadge(`Dalam Radius (${Math.round(dist)}m)`, "success");
      } else {
        insideRadius = false;
        setDistanceBadge(`Di Luar Radius (${Math.round(dist)}m)`, "error");
      }

      evaluateSwipeRequirement();
    },
    () => {
      setGpsStatusDisplay("Mati / Ditolak", "error");
      insideRadius = false;
      evaluateSwipeRequirement();
    },
    { enableHighAccuracy: true },
  );
}

function setDistanceBadge(text, type) {
  const badge = document.getElementById("distance-badge");
  badge.innerText = text;
  if (type === "success") {
    badge.className = "bg-emerald-50 text-emerald-600";
  } else if (type === "error") {
    badge.className = "bg-red-50 text-red-600";
  } else {
    badge.className = "bg-amber-50 text-amber-600";
  }
}

function setGpsStatusDisplay(text, type) {
  const txt = document.getElementById("dashboard-status-text");
  txt.innerText = text;
  if (type === "success") txt.className = "text-emerald-600";
  else if (type === "error") txt.className = "text-red-600";
  else txt.className = "text-amber-600";
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function initCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    window.showModernModal("Kamera", "Browser ini belum mendukung akses kamera.", "warning");
    return;
  }

  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: "user" } })
    .then((stream) => {
      video.srcObject = stream;
    })
    .catch(() => {
      window.showModernModal("Kamera", "Nyalakan izin kamera depan untuk verifikasi.", "warning");
    });
}

window.takePicture = () => {
  if (!video.videoWidth) {
    return window.showModernModal("Kamera Belum Siap", "Tunggu kamera aktif sebentar lalu coba lagi.", "warning");
  }

  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  base64Foto = canvas.toDataURL("image/jpeg", 0.72);
  capturedImg.src = base64Foto;
  video.classList.add("hidden");
  capturedImg.classList.remove("hidden");
  document.getElementById("btn-snap").classList.add("hidden");
  document.getElementById("btn-retake").classList.remove("hidden");
  evaluateSwipeRequirement();
};

window.resetPicture = () => {
  base64Foto = "";
  capturedImg.src = "";
  video.classList.remove("hidden");
  capturedImg.classList.add("hidden");
  document.getElementById("btn-snap").classList.remove("hidden");
  document.getElementById("btn-retake").classList.add("hidden");
  evaluateSwipeRequirement();
};

function updateTodayAttendanceState(historyList) {
  const todayKey = getTodayKey();
  const todayList = historyList.filter((item) => {
    if (item.dateKey) return item.dateKey === todayKey;
    return String(item.waktu || "").startsWith(new Date().toLocaleDateString("id-ID"));
  });

  const hasPergi = todayList.some((item) => (item.tipeAbsen || item.jenisAbsen) === "pergi");
  const hasPulang = todayList.some((item) => (item.tipeAbsen || item.jenisAbsen) === "pulang");

  todayAttendanceCount = Math.min(todayList.length, 2);
  if (!hasPergi && todayList.length === 0) {
    nextAttendanceType = "pergi";
    attendanceLocked = false;
  } else if (!hasPulang && todayList.length < 2) {
    nextAttendanceType = "pulang";
    attendanceLocked = false;
  } else {
    attendanceLocked = true;
  }
}

function updateTodayAttendanceUI() {
  const title = document.getElementById("today-status-title");
  const desc = document.getElementById("today-status-desc");
  const badge = document.getElementById("today-step-badge");
  const formTitle = document.getElementById("absen-form-title");
  const navAbsen = document.getElementById("nav-absen-sheet");

  badge.innerText = `${todayAttendanceCount}/2`;

  if (attendanceLocked) {
    title.innerText = "Absensi Hari Ini Selesai";
    desc.innerText = "Anda sudah absen pergi dan pulang. Absensi tambahan dikunci sampai besok.";
    formTitle.innerText = "Absensi Hari Ini Sudah Selesai";
    navAbsen.classList.add("locked");
  } else if (nextAttendanceType === "pulang") {
    title.innerText = "Menunggu Absen Pulang";
    desc.innerText = "Absen pergi sudah tercatat. Anda masih bisa melakukan absen pulang satu kali.";
    formTitle.innerText = "Formulir Absen Pulang";
    navAbsen.classList.remove("locked");
  } else {
    title.innerText = "Siap Absen Pergi";
    desc.innerText = "Lakukan absen pergi di area kantor, lalu absen pulang setelah selesai bertugas.";
    formTitle.innerText = "Formulir Absen Pergi";
    navAbsen.classList.remove("locked");
  }

  evaluateSwipeRequirement();
}

function evaluateSwipeRequirement() {
  const container = document.getElementById("swipe-container-wrapper");
  const text = document.getElementById("swipe-text-label");
  const icon = document.getElementById("swipe-icon");

  if (attendanceLocked) {
    container.classList.add("disabled");
    text.innerText = "ABSENSI HARI INI SUDAH SELESAI";
    icon.setAttribute("data-lucide", "check-circle");
    window.resetSwipeState();
  } else if (base64Foto && insideRadius) {
    container.classList.remove("disabled");
    text.innerText = `GESER UNTUK ABSEN ${nextAttendanceType.toUpperCase()}`;
    icon.setAttribute("data-lucide", "chevrons-right");
  } else {
    container.classList.add("disabled");
    if (!base64Foto && !insideRadius) {
      text.innerText = "AMBIL FOTO & MASUK RADIUS KANTOR";
    } else if (!base64Foto) {
      text.innerText = "AMBIL FOTO VERIFIKASI WAJAH";
    } else {
      text.innerText = "ANDA DI LUAR RADIUS KANTOR";
    }
    icon.setAttribute("data-lucide", "lock");
    window.resetSwipeState();
  }

  lucide.createIcons();
}

window.resetSwipeState = () => {};

function initSwipeButton() {
  if (swipeReady) return;
  swipeReady = true;

  const trigger = document.getElementById("swipe-trigger");
  const container = document.getElementById("swipe-container-wrapper");
  const fill = document.getElementById("swipe-fill");
  const text = document.getElementById("swipe-text-label");

  let isDragging = false;
  let startX = 0;
  let maxDragWidth = 0;

  const onStart = (e) => {
    if (container.classList.contains("disabled")) return;
    isDragging = true;
    maxDragWidth = container.clientWidth - trigger.clientWidth - 8;
    startX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
    trigger.style.transition = "none";
    fill.style.transition = "none";
  };

  const onMove = (e) => {
    if (!isDragging) return;
    const currentX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
    let deltaX = currentX - startX;
    if (deltaX < 0) deltaX = 0;
    if (deltaX > maxDragWidth) deltaX = maxDragWidth;
    trigger.style.left = `${deltaX + 3}px`;
    fill.style.width = `${deltaX + 24}px`;
  };

  const onEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    const currentLeft = parseInt(trigger.style.left, 10) || 0;

    if (currentLeft >= maxDragWidth - 10) {
      trigger.style.left = `${maxDragWidth + 3}px`;
      fill.style.width = "100%";
      text.innerText = "MENYIMPAN...";
      trigger.style.backgroundColor = "#10b981";
      executeAbsensiSubmit();
    } else {
      window.resetSwipeState();
    }
  };

  trigger.addEventListener("mousedown", onStart);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onEnd);
  trigger.addEventListener("touchstart", onStart, { passive: true });
  window.addEventListener("touchmove", onMove, { passive: true });
  window.addEventListener("touchend", onEnd);

  window.resetSwipeState = () => {
    trigger.style.transition = "all 0.3s ease";
    fill.style.transition = "all 0.3s ease";
    trigger.style.left = "3px";
    fill.style.width = "0px";
    trigger.style.backgroundColor = container.classList.contains("disabled") ? "#94a3b8" : "#2563eb";
    if (!container.classList.contains("disabled")) {
      text.innerText = `GESER UNTUK ABSEN ${nextAttendanceType.toUpperCase()}`;
    }
  };
}

async function executeAbsensiSubmit() {
  if (attendanceLocked) {
    window.showModernModal("Absensi Ditutup", "Anda sudah melakukan absen pergi dan pulang hari ini.", "warning");
    window.resetSwipeState();
    return;
  }

  showLoading(true);
  try {
    await fetchUserHistory(false);
    if (attendanceLocked) {
      showLoading(false);
      window.showModernModal("Absensi Ditutup", "Data terbaru menunjukkan absensi hari ini sudah lengkap.", "warning");
      window.resetSwipeState();
      return;
    }

    const now = new Date();
    const submittedType = nextAttendanceType;
    const limitTime = new Date();
    limitTime.setHours(8, 0, 0, 0);
    const status = submittedType === "pergi" && now > limitTime ? "Terlambat" : "Tepat Waktu";
    const formatWaktu = `${now.toLocaleDateString("id-ID")}, ${now.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;

    await addDoc(collection(db, "absensi"), {
      userId: currentUser.id,
      nama: getDisplayName(currentUser),
      namaStaff: getDisplayName(currentUser),
      desaId: currentUser.desaId || "",
      foto: base64Foto,
      fotoUrl: base64Foto,
      lat: userLat,
      latitude: userLat,
      lon: userLon,
      longitude: userLon,
      status,
      tipeAbsen: submittedType,
      jenisAbsen: submittedType,
      dateKey: getTodayKey(now),
      waktu: formatWaktu,
      tanggal: now.toLocaleDateString("id-ID"),
      timestamp: now,
    });

    window.resetPicture();
    await fetchUserHistory();
    showLoading(false);
    setElementText(
      "success-message",
      `Absen ${submittedType === "pergi" ? "pergi" : "pulang"} berhasil disimpan.`,
    );
    document.getElementById("success-modal").className = "";
  } catch (err) {
    showLoading(false);
    window.showModernModal("Gagal Mengirim", "Terjadi kegagalan komunikasi dengan server.", "error");
    window.resetSwipeState();
  }
}

async function fetchUserHistory(render = true) {
  const container = document.getElementById("history-container");
  if (!currentUser) return;

  try {
    const q = query(collection(db, "absensi"), where("userId", "==", currentUser.id));
    const snap = await getDocs(q);
    const historyList = [];
    let totalPergi = 0;
    let totalPulang = 0;

    snap.forEach((d) => {
      const data = { id: d.id, ...d.data() };
      historyList.push(data);
      const type = data.tipeAbsen || data.jenisAbsen || "pergi";
      if (type === "pulang") totalPulang++;
      else totalPergi++;
    });

    updateTodayAttendanceState(historyList);
    updateTodayAttendanceUI();
    setElementText("count-pergi", totalPergi);
    setElementText("count-pulang", totalPulang);

    if (!render) return;

    historyList.sort((a, b) => {
      const at = a.timestamp?.seconds || (a.timestamp instanceof Date ? a.timestamp.getTime() / 1000 : 0);
      const bt = b.timestamp?.seconds || (b.timestamp instanceof Date ? b.timestamp.getTime() / 1000 : 0);
      return bt - at;
    });

    if (historyList.length === 0) {
      container.innerHTML = `<div class="text-center text-xs text-slate-400 py-12">Belum ada riwayat presensi.</div>`;
      return;
    }

    container.innerHTML = "";
    historyList.forEach((item) => {
      const type = item.tipeAbsen || item.jenisAbsen || "pergi";
      const typeLabel = type === "pulang" ? "Absen Pulang" : "Absen Pergi";
      const statusClass =
        item.status === "Terlambat" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600";

      container.innerHTML += `
        <div class="flex items-center justify-between p-3.5 bg-white border border-slate-200/50 rounded-2xl">
          <div class="flex items-center gap-3 min-w-0">
            <img src="${item.foto || item.fotoUrl || ""}" class="w-11 h-11 object-cover rounded-xl border border-slate-100 bg-slate-100" alt="">
            <div class="min-w-0">
              <p class="text-xs font-black text-slate-800">${typeLabel}</p>
              <p class="text-[10px] text-slate-400 font-bold font-mono mt-0.5 truncate">${item.waktu || "-"}</p>
            </div>
          </div>
          <span class="text-[9px] font-bold px-2.5 py-1 rounded-full ${statusClass}">
            ${item.status || "Tercatat"}
          </span>
        </div>
      `;
    });
  } catch (e) {
    if (render) {
      container.innerHTML = `<div class="text-center text-xs text-red-400 py-12">Gagal memuat riwayat.</div>`;
    }
  }
}

async function fetchBroadcasts() {
  const container = document.getElementById("info-container");

  try {
    const snap = await getDocs(collection(db, "broadcasts"));
    const list = [];
    snap.forEach((d) => {
      const data = d.data();
      const target = data.scopeDesaId || data.desaId;
      if (target === "all" || target === "ALL" || target === currentUser.desaId) list.push(data);
    });

    if (list.length === 0) {
      container.innerHTML = `<div class="text-center text-xs text-slate-400 py-12">Tidak ada pengumuman baru.</div>`;
      return;
    }

    container.innerHTML = "";
    list.forEach((bc) => {
      container.innerHTML += `
        <div class="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-xs relative overflow-hidden">
          <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-500"></div>
          <span class="text-[9px] font-bold text-orange-500 uppercase tracking-wider block mb-1">Pengumuman</span>
          <h4 class="text-xs font-black text-slate-900 leading-snug">${bc.title || "Pengumuman"}</h4>
          <p class="text-[11px] text-slate-500 font-medium leading-relaxed mt-1.5">${bc.body || bc.pesan || bc.message || bc.content || "-"}</p>
        </div>
      `;
    });
  } catch (e) {
    container.innerHTML = `<div class="text-center text-xs text-red-400 py-12">Gagal memuat pengumuman.</div>`;
  }
}

function registerPwa() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}

registerPwa();
checkPersistentSession();
lucide.createIcons();
