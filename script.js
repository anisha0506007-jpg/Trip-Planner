const $ = selector => document.querySelector(selector);

const COLORS = [
  "#ff6f4e",
  "#0e8a86",
  "#f4b942",
  "#7b5cd6",
  "#2f80ed",
  "#d6336c",
  "#2b8a3e"
];

const TIMES = [
  "09:00",
  "11:30",
  "13:30",
  "16:00",
  "19:00",
  "21:00"
];

const INTERESTS = {
  culture: {
    q: ["museum", "temple", "palace", "monument"],
    cat: "Sightseeing",
    cost: 400
  },
  food: {
    q: ["restaurant", "cafe", "street food"],
    cat: "Food",
    cost: 600
  },
  nature: {
    q: ["park", "garden", "lake", "viewpoint"],
    cat: "Sightseeing",
    cost: 200
  },
  shopping: {
    q: ["market", "bazaar", "mall"],
    cat: "Shopping",
    cost: 1500
  },
  nightlife: {
    q: ["bar", "club", "night market"],
    cat: "Other",
    cost: 1200
  }
};

const WX = {
  0: "☀️",
  1: "🌤",
  2: "⛅",
  3: "☁️",
  45: "🌫",
  48: "🌫",
  51: "🌦",
  53: "🌦",
  55: "🌧",
  61: "🌧",
  63: "🌧",
  65: "🌧",
  71: "❄️",
  80: "🌦",
  81: "🌧",
  95: "⛈",
  96: "⛈",
  99: "⛈"
};

let state = {
  dest: "",
  lat: 26.91,
  lon: 75.79,
  start: "",
  budget: 30000,
  plan: []
};

let weather = {};
let map;
let layer;
let uid = 1;
let readOnly = false;

const SAVED_TRIPS_KEY = "tripweave-saved-trips";

/* ---------- Helpers ---------- */

const money = amount =>
  "₹" + Math.round(amount).toLocaleString("en-IN");

const dayDate = index => {
  const date = new Date(state.start + "T00:00:00");
  date.setDate(date.getDate() + index);
  return date;
};

const fmt = (date, options) =>
  date.toLocaleDateString("en-GB", options);

const iso = date =>
  date.getFullYear() +
  "-" +
  String(date.getMonth() + 1).padStart(2, "0") +
  "-" +
  String(date.getDate()).padStart(2, "0");

const toast = message => {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    element.classList.remove("show");
  }, 2600);
};

const sleep = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

/* ---------- API calls ---------- */

async function geo(query) {
  const response = await fetch(
    "https://nominatim.openstreetmap.org/search?format=json&limit=5&q=" +
    encodeURIComponent(query)
  );

  if (!response.ok) {
    throw new Error("Location search failed");
  }

  return response.json();
}

async function loadWeather() {
  weather = {};

  if (!state.start || !state.plan.length) {
    renderBoard();
    return;
  }

  try {
    const end = iso(dayDate(state.plan.length - 1));

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${state.lat}` +
      `&longitude=${state.lon}` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min` +
      `&timezone=auto` +
      `&start_date=${state.start}` +
      `&end_date=${end}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Weather request failed");
    }

    const data = await response.json();

    (data.daily?.time || []).forEach((date, index) => {
      weather[date] = {
        icon: WX[data.daily.weathercode[index]] || "🌡",
        hi: Math.round(data.daily.temperature_2m_max[index]),
        lo: Math.round(data.daily.temperature_2m_min[index])
      };
    });
  } catch (error) {
  }

  renderBoard();
}


async function generate() {
  const picks = [
    ...document.querySelectorAll("#chips .on")
  ].map(button => button.dataset.i);

  if (!picks.length) {
    return toast("Pick at least one interest");
  }

  const destination = $("#dest").value.trim();

  if (!destination) {
    return toast("Enter a destination");
  }

  const start = $("#start").value;

  if (!start) {
    return toast("Choose your start date");
  }

  const selectedDate = new Date(start + "T00:00:00");

  if (Number.isNaN(selectedDate.getTime())) {
    return toast("Choose a valid start date");
  }

  const days = Math.min(
    7,
    Math.max(1, Number($("#days").value) || 3)
  );

  state.dest = destination;
  state.start = start;
  state.budget = Math.max(0, Number($("#budget").value) || 0);

  $("#days").value = days;
  $("#status").textContent = "Finding places…";
  $("#genBtn").disabled = true;

  try {
    const locations = await geo(state.dest);
    const city = locations[0];

    if (!city) {
      $("#status").textContent = "Destination not found.";
      return;
    }

    state.lat = Number(city.lat);
    state.lon = Number(city.lon);

    const pool = [];

    for (const key of picks) {
      for (const term of INTERESTS[key].q.slice(0, 2)) {
        await sleep(1100);

        let found = [];

        try {
          found = await geo(`${term} in ${state.dest}`);
        } catch (error) {
        }

        found.forEach(place => {
          pool.push({
            id: uid++,
            name: place.display_name.split(",")[0],
            cat: INTERESTS[key].cat,
            cost: INTERESTS[key].cost,
            lat: Number(place.lat),
            lon: Number(place.lon)
          });
        });
      }
    }

    const seen = new Set();

    const unique = pool.filter(place => {
      const key = place.name.toLowerCase();

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });

    if (!unique.length) {
      picks.forEach(key => {
        INTERESTS[key].q.forEach((term, index) => {
          unique.push({
            id: uid++,
            name: term[0].toUpperCase() + term.slice(1) + " visit",
            cat: INTERESTS[key].cat,
            cost: INTERESTS[key].cost,
            lat: state.lat + (Math.random() - 0.5) * 0.08,
            lon: state.lon + (Math.random() - 0.5) * 0.08
          });
        });
      });
    }

    unique.sort(() => Math.random() - 0.5);

    state.plan = Array.from({ length: days }, () => []);

    const selectedPlaces = unique.slice(0, days * 4);

    selectedPlaces.forEach((place, index) => {
      state.plan[index % days].push(place);
    });

    state.plan.forEach(day => {
      day.push({
        id: uid++,
        name: "Local transport",
        cat: "Transport",
        cost: 400,
        lat: null,
        lon: null
      });
    });

    $("#status").textContent =
      `Done – ${selectedPlaces.length} places across ${days} days.`;

    map.setView([state.lat, state.lon], 12);

    refresh();
    await loadWeather();
  } catch (error) {
    $("#status").textContent =
      "Network error – check your connection and try again.";
  } finally {
    $("#genBtn").disabled = false;
  }
}


function refresh() {
  renderDaySelect();
  renderBoard();
  renderMap();
  renderBudget();
}

function renderDaySelect() {
  const select = $("#aDay");

  select.innerHTML = state.plan
    .map((_, index) =>
      `<option value="${index}">Day ${index + 1}</option>`
    )
    .join("");
}

function renderBoard() {
  const board = $("#days-board");

  if (!state.plan.length) {
    board.innerHTML = `
      <p class="empty">
        Set your trip details and press
        “Build my itinerary” to get started.
      </p>
    `;
    return;
  }

  board.innerHTML = state.plan.map((items, dayIndex) => {
    const date = dayDate(dayIndex);
    const forecast = weather[iso(date)];

    const weatherHTML = forecast
      ? `${forecast.icon}<br>${forecast.hi}° / ${forecast.lo}°`
      : "<small>No forecast</small>";

    const cardsHTML = items.map((activity, index) => `
      <div
        class="card"
        draggable="${!readOnly}"
        data-id="${activity.id}"
      >
        <div class="t">${TIMES[index] || "22:00"}</div>
        ${escapeHTML(activity.name)}
        <div class="c">
          ${escapeHTML(activity.cat)} · ${money(activity.cost)}
        </div>
        ${readOnly ? "" : `
          <button
            class="x"
            type="button"
            title="Remove activity"
            aria-label="Remove ${escapeHTML(activity.name)}"
          >×</button>
        `}
      </div>
    `).join("");

    return `
      <div class="day" data-d="${dayIndex}">
        <div class="day-head">
          <div>
            <b>Day ${dayIndex + 1}</b>
            <small>
              ${fmt(date, {
                weekday: "short",
                day: "numeric",
                month: "short"
              })}
            </small>
          </div>
          <div class="wx">${weatherHTML}</div>
        </div>

        <div class="list">
          ${cardsHTML || '<p class="empty">Drop activities here</p>'}
        </div>
      </div>
    `;
  }).join("");

  if (!readOnly) {
    bindDnD();
  }

  board.querySelectorAll(".x").forEach(button => {
    button.onclick = event => {
      const card = event.currentTarget.closest(".card");
      removeItem(Number(card.dataset.id));
    };
  });
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}


function removeItem(id) {
  state.plan.forEach(day => {
    const index = day.findIndex(activity => activity.id === id);

    if (index !== -1) {
      day.splice(index, 1);
    }
  });

  refresh();
}


function bindDnD() {
  let dragId = null;

  document.querySelectorAll(".card").forEach(card => {
    card.ondragstart = event => {
      dragId = Number(card.dataset.id);
      card.classList.add("drag");

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(dragId));
      }
    };

    card.ondragend = () => {
      card.classList.remove("drag");

      document.querySelectorAll(".day").forEach(day => {
        day.classList.remove("over");
      });
    };
  });

  document.querySelectorAll(".day").forEach(column => {
    column.ondragover = event => {
      event.preventDefault();
      column.classList.add("over");
    };

    column.ondragleave = event => {
      if (!column.contains(event.relatedTarget)) {
        column.classList.remove("over");
      }
    };

    column.ondrop = event => {
      event.preventDefault();
      column.classList.remove("over");

      const target = event.target.closest(".card");
      const targetDayIndex = Number(column.dataset.d);

      let draggedItem = null;

      state.plan.forEach(day => {
        const index = day.findIndex(
          activity => activity.id === dragId
        );

        if (index !== -1) {
          draggedItem = day.splice(index, 1)[0];
        }
      });

      if (!draggedItem) return;

      const destinationDay = state.plan[targetDayIndex];

      let insertIndex = target
        ? destinationDay.findIndex(
            activity => activity.id === Number(target.dataset.id)
          )
        : destinationDay.length;

      if (insertIndex < 0) {
        insertIndex = destinationDay.length;
      }

      destinationDay.splice(insertIndex, 0, draggedItem);

      refresh();
    };
  });
}


function renderMap() {
  if (!layer) return;

  layer.clearLayers();

  const allPoints = [];

  state.plan.forEach((items, dayIndex) => {
    const places = items.filter(
      activity =>
        activity.lat != null &&
        activity.lon != null
    );

    const points = places.map(activity => [
      activity.lat,
      activity.lon
    ]);

    const color = COLORS[dayIndex % COLORS.length];

    if (points.length > 1) {
      L.polyline(points, {
        color,
        weight: 3,
        dashArray: "6 6"
      }).addTo(layer);
    }

    places.forEach(activity => {
      const marker = L.marker(
        [activity.lat, activity.lon],
        {
          icon: L.divIcon({
            className: "pin",
            html: String(dayIndex + 1),
            iconSize: [24, 24]
          })
        }
      );

      marker.bindPopup(`
        <b>${escapeHTML(activity.name)}</b><br>
        Day ${dayIndex + 1} · ${money(activity.cost)}
      `);

      marker.addTo(layer);

      allPoints.push([activity.lat, activity.lon]);
    });
  });

  if (allPoints.length) {
    map.fitBounds(allPoints, {
      padding: [30, 30],
      maxZoom: 14
    });
  } else if (state.lat != null && state.lon != null) {
    map.setView([state.lat, state.lon], 12);
  }
}


function renderBudget() {
  const allActivities = state.plan.flat();

  const spent = allActivities.reduce(
    (total, activity) => total + (Number(activity.cost) || 0),
    0
  );

  const budget = Number(state.budget) || 0;
  const left = budget - spent;

  const percentage = budget > 0
    ? Math.min(100, spent / budget * 100)
    : 0;

  const categories = {};

  allActivities.forEach(activity => {
    categories[activity.cat] =
      (categories[activity.cat] || 0) +
      (Number(activity.cost) || 0);
  });

  $("#budgetView").innerHTML = `
    <div class="stats">
      <div>
        Budget
        <b>${money(budget)}</b>
      </div>

      <div>
        Planned
        <b>${money(spent)}</b>
      </div>

      <div>
        ${left < 0 ? "Over by" : "Left"}
        <b style="color:${left < 0 ? "#ff6f4e" : "inherit"}">
          ${money(Math.abs(left))}
        </b>
      </div>
    </div>

    <div class="bar">
      <i
        class="${left < 0 ? "over" : ""}"
        style="width:${percentage}%"
      ></i>
    </div>

    ${Object.entries(categories)
      .sort((first, second) => second[1] - first[1])
      .map(([category, amount]) => `
        <div class="cat">
          <span>${escapeHTML(category)}</span>
          <div class="bar">
            <i style="width:${amount / (spent || 1) * 100}%"></i>
          </div>
          <span>${money(amount)}</span>
        </div>
      `).join("") ||
      '<p class="empty">Add activities to see the breakdown.</p>'
    }

    ${state.plan.length ? `
      <p class="hint" style="margin-top:12px;margin-bottom:0">
        Average per day: ${money(spent / state.plan.length)}
      </p>
    ` : ""}
  `;
}


function addActivity() {
  const name = $("#aName").value.trim();

  if (!state.plan.length) {
    return toast("Build an itinerary first");
  }

  if (!name) {
    return toast("Enter an activity name");
  }

  const dayIndex = Number($("#aDay").value);

  if (!state.plan[dayIndex]) {
    return toast("Choose a valid day");
  }

  const cost = Math.max(0, Number($("#aCost").value) || 0);

  state.plan[dayIndex].push({
    id: uid++,
    name,
    cat: $("#aCat").value,
    cost,
    lat: null,
    lon: null
  });

  $("#aName").value = "";

  refresh();
  toast("Activity added!");
}


function getSavedTrips() {
  try {
    const trips = JSON.parse(
      localStorage.getItem(SAVED_TRIPS_KEY) || "[]"
    );

    return Array.isArray(trips) ? trips : [];
  } catch (error) {
    return [];
  }
}

function saveTrip() {
  if (readOnly) {
    return toast("Open your own itinerary to save it");
  }

  if (!state.plan.length) {
    return toast("Build an itinerary before saving");
  }

  const name = prompt(
    "Give your trip a name:",
    state.dest || "My Trip"
  );

  if (name === null || !name.trim()) return;

  try {
    const trips = getSavedTrips();

    trips.unshift({
      id: Date.now(),
      name: name.trim(),
      savedAt: new Date().toISOString(),
      trip: JSON.parse(JSON.stringify(state))
    });

    localStorage.setItem(
      SAVED_TRIPS_KEY,
      JSON.stringify(trips)
    );

    renderSavedTrips();
    toast("Trip saved successfully!");
  } catch (error) {
    toast("Could not save trip. Browser storage may be full.");
  }
}

function renderSavedTrips() {
  const container = $("#savedTripsList");

  if (!container) return;

  const trips = getSavedTrips();

  if (!trips.length) {
    container.innerHTML = `
      <div class="saved-empty">
        <div style="font-size:1.8rem">🧳</div>
        <strong>No saved trips yet</strong>
        <p>Build an itinerary and save it to see it here.</p>
      </div>
    `;

    return;
  }

  container.innerHTML = trips.map(saved => {
    const trip = saved.trip || {};
    const plan = Array.isArray(trip.plan) ? trip.plan : [];

    const activityCount = plan.reduce(
      (total, day) => total + day.length,
      0
    );

    const dateText = trip.start
      ? new Date(trip.start + "T00:00:00").toLocaleDateString(
          "en-GB",
          { day: "numeric", month: "short", year: "numeric" }
        )
      : "Date not set";

    return `
      <article class="saved-trip">
        <h3>✈ ${escapeHTML(saved.name)}</h3>

        <p>📍 ${escapeHTML(trip.dest || "Unknown destination")}</p>
        <p>📅 ${escapeHTML(dateText)}</p>

        <p>
          ${plan.length} day${plan.length === 1 ? "" : "s"}
          · ${activityCount} activities
        </p>

        <p>💰 ${money(trip.budget || 0)} budget</p>

        <div class="saved-actions">
          <button
            type="button"
            data-load-trip="${saved.id}"
          >
            Open trip
          </button>

          <button
            type="button"
            class="delete-trip"
            data-delete-trip="${saved.id}"
          >
            Delete
          </button>
        </div>
      </article>
    `;
  }).join("");
}

async function loadSavedTrip(id) {
  const saved = getSavedTrips().find(
    trip => String(trip.id) === String(id)
  );

  if (!saved || !saved.trip) {
    return toast("Saved trip not found");
  }

  try {
    const restored = JSON.parse(JSON.stringify(saved.trip));

    if (!Array.isArray(restored.plan)) {
      throw new Error("Invalid saved itinerary");
    }

    state = {
      ...restored,
      plan: restored.plan.map(day =>
        Array.isArray(day) ? day : []
      )
    };

    readOnly = false;
    document.body.classList.remove("view");

    $("#dest").value = state.dest || "";
    $("#start").value = state.start || "";
    $("#days").value = state.plan.length || 1;
    $("#budget").value = state.budget || 0;

    const ids = state.plan
      .flat()
      .map(activity => Number(activity.id) || 0);

    uid = Math.max(0, ...ids) + 1;

    weather = {};

    map.setView(
      [state.lat || 26.91, state.lon || 75.79],
      12
    );

    refresh();
    renderSavedTrips();

    await loadWeather();

    toast("Trip loaded successfully!");

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  } catch (error) {
    toast("Could not open this saved trip");
  }
}

function deleteSavedTrip(id) {
  const trips = getSavedTrips();

  const selected = trips.find(
    trip => String(trip.id) === String(id)
  );

  if (!selected) return;

  if (!confirm(`Delete "${selected.name}"?`)) return;

  try {
    const updatedTrips = trips.filter(
      trip => String(trip.id) !== String(id)
    );

    localStorage.setItem(
      SAVED_TRIPS_KEY,
      JSON.stringify(updatedTrips)
    );

    renderSavedTrips();
    toast("Saved trip deleted");
  } catch (error) {
    toast("Could not delete this trip");
  }
}


async function share() {
  if (!state.plan.length) {
    return toast("Build an itinerary first");
  }

  try {
    const encoded = btoa(
      unescape(encodeURIComponent(JSON.stringify(state)))
    );

    const url =
      location.href.split("#")[0] + "#s=" + encoded;

    await navigator.clipboard.writeText(url);

    toast("Share link copied!");
  } catch (error) {
    const encoded = btoa(
      unescape(encodeURIComponent(JSON.stringify(state)))
    );

    const url =
      location.href.split("#")[0] + "#s=" + encoded;

    prompt("Copy this share link:", url);
  }
}

function loadShared() {
  const match = location.hash.match(/#s=(.+)/);

  if (!match) return false;

  try {
    const sharedState = JSON.parse(
      decodeURIComponent(escape(atob(match[1])))
    );

    if (!sharedState || !Array.isArray(sharedState.plan)) {
      return false;
    }

    state = sharedState;
    readOnly = true;

    document.body.classList.add("view");

    uid = Math.max(
      0,
      ...state.plan.flat().map(activity => Number(activity.id) || 0)
    ) + 1;

    return true;
  } catch (error) {
    return false;
  }
}


map = L.map("map").setView(
  [state.lat, state.lon],
  5
);

L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    attribution: "&copy; OpenStreetMap contributors"
  }
).addTo(map);

layer = L.layerGroup().addTo(map);

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
$("#start").value = iso(tomorrow);

$("#chips").addEventListener("click", event => {
  const button = event.target.closest("button[data-i]");

  if (button) {
    button.classList.toggle("on");
  }
});

$("#genBtn").addEventListener("click", generate);
$("#addBtn").addEventListener("click", addActivity);
$("#shareBtn").addEventListener("click", share);
$("#saveTripBtn").addEventListener("click", saveTrip);

$("#budget").addEventListener("input", event => {
  state.budget = Math.max(0, Number(event.target.value) || 0);
  renderBudget();
});

$("#savedTripsList").addEventListener("click", event => {
  const loadButton = event.target.closest("[data-load-trip]");
  const deleteButton = event.target.closest("[data-delete-trip]");

  if (loadButton) {
    loadSavedTrip(loadButton.dataset.loadTrip);
  }

  if (deleteButton) {
    deleteSavedTrip(deleteButton.dataset.deleteTrip);
  }
});

if (loadShared()) {
  $("#shareBtn").style.display = "none";
  refresh();
  loadWeather();
} else {
  renderBoard();
  renderBudget();
}

renderSavedTrips();
