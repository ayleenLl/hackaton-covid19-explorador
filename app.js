/* ============================================================
   APP.JS — Explorador COVID-19
   ============================================================
   Este archivo está organizado en 3 bloques:
   1. CLASES (Programación Orientada a Objetos)
   2. FUNCIONES DE ARRANQUE (fetch, Promise.all, render inicial)
   3. EVENTOS E INTERACTIVIDAD (select, búsqueda, tema, scroll)


================================================================ */


/* ----------------------------------------------------------------
   CLASE 1: CovidAPI
   Responsabilidad: hacer las peticiones HTTP y entregar datos limpios.
   No toca el DOM, no sabe que existe Tailwind ni Chart.js.
------------------------------------------------------------------- */
class CovidAPI {
    // El constructor guarda la URL base una sola vez.
    // Así, si disease.sh cambiara de dominio, solo editamos esta línea.
    constructor() {
        this.baseURL = "https://disease.sh/v3/covid-19";
    }


    async _get(endpoint) {
        // fetch() devuelve una Promise; "await" pausa la función hasta que
        // el servidor responde, sin bloquear el resto de la página.
        const response = await fetch(`${this.baseURL}${endpoint}`);

        // fetch() NO lanza error automáticamente si el servidor responde
        // con un código de error (404, 500, etc). Por eso lo chequeamos a mano:
        if (!response.ok) {
            throw new Error(`Error ${response.status} al consultar ${endpoint}`);
        }

        // .json() también es asíncrono: convierte el texto crudo de la
        // respuesta en un objeto/array de JavaScript que ya podemos usar.
        return response.json();
    }

    // Endpoint 1: totales globales (hoy/ayer/anteayer)
    getGlobalStats() {
        return this._get("/all");
    }

    // Endpoint 2: todos los países (para el ranking y el selector)
    getAllCountries() {
        return this._get("/countries");
    }

    // Endpoint 3: todos los continentes (para el gráfico de distribución)
    getContinents() {
        return this._get("/continents");
    }

    // Endpoint extra: un país específico (usado por el buscador/selector)
    getCountry(name) {
        // encodeURIComponent evita romper la URL si el país tiene espacios,
        // por ejemplo "United Kingdom" -> "United%20Kingdom"
        return this._get(`/countries/${encodeURIComponent(name)}`);
    }
}


/* ----------------------------------------------------------------
   CLASE 2: Dashboard
   Responsabilidad: recibir datos ya listos y pintarlos en el DOM.
   Todo lo que sea "document.getElementById", "innerHTML", etc. vive aquí.
------------------------------------------------------------------- */
class Dashboard {
    constructor() {
        // Crea e inicia objetos
        this.els = {
            loading: document.getElementById("loading-state"),
            error: document.getElementById("error-state"),
            content: document.getElementById("app-content"),
            globalCards: document.getElementById("global-cards"),
            rankingBody: document.getElementById("ranking-body"),
            countrySelect: document.getElementById("country-select"),
            countryDetail: document.getElementById("country-detail"),
            lastUpdated: document.getElementById("last-updated"),
            gallery: document.getElementById("gallery"),
        };


        this.formatter = new Intl.NumberFormat("es-CL");
    }



    showLoading() {
        this.els.loading.classList.remove("hidden");
        this.els.loading.classList.add("flex");
        this.els.error.classList.add("hidden");
        this.els.content.classList.add("hidden");
    }

    showError() {
        this.els.loading.classList.add("hidden");
        this.els.error.classList.remove("hidden");
        this.els.error.classList.add("flex");
        this.els.content.classList.add("hidden");
    }

    showContent() {
        this.els.loading.classList.add("hidden");
        this.els.error.classList.add("hidden");
        this.els.content.classList.remove("hidden");
    }

    // --- Render de las 4 tarjetas globales ---
    renderGlobalCards(global) {
        // Definimos un arreglo de objetos: cada uno describe UNA tarjeta.
        // Así evitamos copiar/pegar el mismo bloque de HTML 4 veces.
        const cards = [
            { label: "Casos totales", value: global.cases, color: "text-ink-900 dark:text-ink-50", icon: "🦠" },
            { label: "Muertes", value: global.deaths, color: "text-alert-500", icon: "⚰️" },
            { label: "Recuperados", value: global.recovered, color: "text-signal-500", icon: "✅" },
            { label: "Casos activos", value: global.active, color: "text-ink-400", icon: "📍" },
        ];

        // .map() transforma cada objeto de "cards" en un string HTML,
        // y .join("") pega todos los strings en uno solo.
        this.els.globalCards.innerHTML = cards
            .map(
                (c) => `
        <div class="p-5 rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-mono text-ink-400 uppercase tracking-wide">${c.label}</span>
            <span>${c.icon}</span>
          </div>
          <p class="font-display font-700 text-2xl md:text-3xl ${c.color}">
            ${this.formatter.format(c.value)}
          </p>
        </div>`
            )
            .join("");
    }


    renderLastUpdated(timestamp) {
        // La API entrega el timestamp en milisegundos (formato Unix epoch * 1000).
        // new Date() lo convierte en una fecha real de JavaScript.
        const date = new Date(timestamp);
        const formatted = date.toLocaleString("es-CL", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
        this.els.lastUpdated.classList.remove("hidden");
        this.els.lastUpdated.textContent = `Actualizado: ${formatted}`;
    }

    // --- Render del ranking de países con barras de progreso ---
    renderRanking(countries) {
        // sort(): ordenamos de mayor a menor número de casos.
        // [...countries] crea una copia para no mutar el arreglo original.
        const sorted = [...countries].sort((a, b) => b.cases - a.cases);

        // slice(0, 10): nos quedamos solo con el Top 10 para no saturar la tabla.
        const top10 = sorted.slice(0, 10);

        // El país con más casos define el 100% de la barra; los demás son proporcionales.
        const maxCases = top10[0].cases;

        this.els.rankingBody.innerHTML = top10
            .map((country) => {
                // Calculamos qué % representa este país respecto al líder.
                const percentage = ((country.cases / maxCases) * 100).toFixed(1);
                return `
        <tr class="hover:bg-ink-50 dark:hover:bg-ink-800/50">
          <td class="px-4 py-3 flex items-center gap-2">
            <img src="${country.countryInfo.flag}" alt="Bandera de ${country.country}" class="w-6 h-4 object-cover rounded-sm">
            ${country.country}
          </td>
          <td class="px-4 py-3 font-mono">${this.formatter.format(country.cases)}</td>
          <td class="px-4 py-3 hidden md:table-cell">
            <div class="w-full h-2 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
              <div class="bar-fill h-full rounded-full bg-signal-500" style="width: ${percentage}%"></div>
            </div>
          </td>
        </tr>`;
            })
            .join("");
    }

    // --- Llena el <select> con la lista de países (orden alfabético) ---
    populateCountrySelect(countries) {
        // sort() alfabético por nombre de país
        const sorted = [...countries].sort((a, b) => a.country.localeCompare(b.country));

        const options = sorted
            .map((c) => `<option value="${c.country}">${c.country}</option>`)
            .join("");

        // Mantenemos la opción "— Selecciona —" y agregamos el resto
        this.els.countrySelect.innerHTML = `<option value="">— Selecciona —</option>${options}`;
    }

    // --- Render del detalle de un país (cuando el usuario elige uno) ---
    renderCountryDetail(country) {
        this.els.countryDetail.classList.remove("hidden");
        this.els.countryDetail.innerHTML = `
      <div class="flex items-center gap-4 mb-4">
        <img src="${country.countryInfo.flag}" alt="Bandera de ${country.country}" class="w-12 h-8 object-cover rounded">
        <h4 class="font-display font-700 text-lg">${country.country}</h4>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><p class="text-ink-400 text-xs uppercase">Casos</p><p class="font-mono font-600">${this.formatter.format(country.cases)}</p></div>
        <div><p class="text-ink-400 text-xs uppercase">Muertes</p><p class="font-mono font-600 text-alert-500">${this.formatter.format(country.deaths)}</p></div>
        <div><p class="text-ink-400 text-xs uppercase">Recuperados</p><p class="font-mono font-600 text-signal-500">${this.formatter.format(country.recovered)}</p></div>
        <div><p class="text-ink-400 text-xs uppercase">Activos</p><p class="font-mono font-600">${this.formatter.format(country.active)}</p></div>
      </div>`;
    }

    // --- Render de la galería con animación scroll-reveal ---
    renderGallery(images) {
        this.els.gallery.innerHTML = images
            .map(
                (img) => `
        <div class="reveal aspect-square rounded-xl overflow-hidden border border-ink-100 dark:border-ink-800">
          <img src="${img.src}" alt="${img.alt}" class="w-full h-full object-cover">
        </div>`
            )
            .join("");

        // Después de inyectar las imágenes, activamos el observer de scroll
        // (definido más abajo en initScrollReveal) para animarlas al aparecer.
        initScrollReveal();
    }

    // --- Gráfico 1: dona de distribución de casos por continente ---
    renderContinentChart(continents) {
        const ctx = document.getElementById("continent-chart");

        // Si ya existe un gráfico dibujado antes (por ejemplo al cambiar de tema
        // o recargar datos), lo destruimos primero. Chart.js no permite dos
        // gráficos activos sobre el mismo <canvas> al mismo tiempo.
        if (this.continentChartInstance) this.continentChartInstance.destroy();

        const labels = continents.map((c) => c.continent);
        const data = continents.map((c) => c.cases);

        this.continentChartInstance = new Chart(ctx, {
            type: "doughnut",
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: ["#3bb3a9", "#f5a623", "#5b7a82", "#1e3338", "#5fd0c7", "#e6921a"],
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: "bottom", labels: { color: this._chartTextColor(), boxWidth: 12, font: { size: 11 } } },
                },
            },
        });
    }

    // --- Gráfico 2: barras con el Top 8 de países por casos ---
    renderTopCountriesChart(countries) {
        const ctx = document.getElementById("top-countries-chart");
        if (this.topChartInstance) this.topChartInstance.destroy();

        const top8 = [...countries].sort((a, b) => b.cases - a.cases).slice(0, 8);

        this.topChartInstance = new Chart(ctx, {
            type: "bar",
            data: {
                labels: top8.map((c) => c.country),
                datasets: [{
                    label: "Casos totales",
                    data: top8.map((c) => c.cases),
                    backgroundColor: "#3bb3a9",
                    borderRadius: 6,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: "y", // barras horizontales: más legible con nombres largos de país
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: this._chartTextColor() }, grid: { color: this._chartGridColor() } },
                    y: { ticks: { color: this._chartTextColor() }, grid: { display: false } },
                },
            },
        });
    }

    // Helpers privados: leen el tema actual para que el texto de los gráficos
    // sea legible tanto en modo claro como oscuro.
    _chartTextColor() {
        return document.documentElement.classList.contains("dark") ? "#dbe5e7" : "#16262a";
    }
    _chartGridColor() {
        return document.documentElement.classList.contains("dark") ? "#1e3338" : "#dbe5e7";
    }

    // Vuelve a dibujar ambos gráficos con los colores correctos del nuevo tema.
    // La llamamos cada vez que el usuario aprieta el botón de tema.
    refreshChartsTheme(continents, countries) {
        if (this.continentChartInstance) this.renderContinentChart(continents);
        if (this.topChartInstance) this.renderTopCountriesChart(countries);
    }
}


/* ============================================================
   2. ARRANQUE DE LA APP
   ============================================================
   Aquí instanciamos nuestras clases y orquestamos la carga de datos.
================================================================ */

// Instancias únicas (un solo "cerebro de datos" y un solo "pintor de UI")
const api = new CovidAPI();
const dashboard = new Dashboard();

// Guardamos los datos descargados en variables globales del módulo
// para poder reutilizarlos después (ej: al cambiar de tema, al buscar un país)
// sin tener que volver a pedirlos a la API.
let cachedCountries = [];
let cachedContinents = [];
let cachedGlobal = null;

/*
  Función principal: orquesta todo el proceso de carga.
  Es "async" porque adentro usamos "await" varias veces.
*/
async function initApp() {
    dashboard.showLoading();

    try {
        /*
          Promise.all() (requisito Oro): en vez de pedir los 3 endpoints uno
          por uno (esperando que termine el primero antes de pedir el segundo),
          los pedimos los TRES AL MISMO TIEMPO. El navegador los manda en
          paralelo y Promise.all espera a que todos terminen.
          Esto hace que la página cargue más rápido que con 3 await seguidos.
        */
        const [global, countries, continents] = await Promise.all([
            api.getGlobalStats(),
            api.getAllCountries(),
            api.getContinents(),
        ]);

        // Guardamos en caché para reutilizar en otras funciones
        cachedGlobal = global;
        cachedCountries = countries;
        cachedContinents = continents;

        // Con los datos ya en mano, le pedimos al Dashboard que los pinte
        dashboard.renderGlobalCards(global);
        dashboard.renderLastUpdated(global.updated);
        dashboard.renderRanking(countries);
        dashboard.populateCountrySelect(countries);
        dashboard.renderContinentChart(continents);
        dashboard.renderTopCountriesChart(countries);
        dashboard.renderGallery(PANDEMIC_IMAGES);

        dashboard.showContent();
    } catch (error) {
        // Si CUALQUIERA de las 3 peticiones falla, Promise.all rechaza
        // inmediatamente y caemos aquí. Mostramos el estado de error amigable.
        console.error("Error al cargar datos de disease.sh:", error);
        dashboard.showError();
    }
}


/* ============================================================
   3. EVENTOS E INTERACTIVIDAD
================================================================ */

// --- Datos estáticos de la galería (imágenes libres de uso, no de la API) ---
const PANDEMIC_IMAGES = [
    // Todas estas son imágenes LOCALES: la ruta es relativa a donde vive
    // index.html. Como "imagenes/" está al mismo nivel que index.html,
    // basta con escribir "imagenes/nombre-del-archivo.jpg" (sin "/" al inicio).
    { src: "imagenes/equipo_medico.jpg", alt: "Personal médico con equipo de protección" },
    { src: "imagenes/VACUNACION.jpg", alt: "Vacunación contra COVID-19" },
    { src: "imagenes/cuarentena.jpg", alt: "Calle vacía durante cuarentena" },
    { src: "imagenes/testCovid.jpg", alt: "Test de COVID-19 en laboratorio" },
];

/* --- EVENT LISTENER 1: selector de país (requisito Bronce: al menos 1 evento) --- */
document.getElementById("country-select").addEventListener("change", async (event) => {
    const countryName = event.target.value;
    if (!countryName) {
        document.getElementById("country-detail").classList.add("hidden");
        return;
    }

    try {
        // Pedimos el detalle fresco de ese país específico a la API
        const country = await api.getCountry(countryName);
        dashboard.renderCountryDetail(country);
    } catch (error) {
        console.error("Error al buscar el país:", error);
    }
});

/* --- EVENT LISTENER 2: input de búsqueda, filtra el <select> en vivo --- */
document.getElementById("country-search").addEventListener("input", (event) => {
    // toLowerCase() para que la búsqueda no distinga mayúsculas/minúsculas
    const query = event.target.value.toLowerCase();

    // filter(): nos quedamos solo con los países cuyo nombre incluye el texto buscado
    const filtered = cachedCountries.filter((c) =>
        c.country.toLowerCase().includes(query)
    );

    dashboard.populateCountrySelect(filtered);
});

/* --- EVENT LISTENER 3: botón de reintentar si la API falló --- */
document.getElementById("retry-btn").addEventListener("click", initApp);

/* --- EVENT LISTENER 4: cambio de tema claro/oscuro --- */
const themeToggleBtn = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const htmlEl = document.documentElement;

themeToggleBtn.addEventListener("click", () => {
    // Activamos la transición suave momentáneamente
    htmlEl.classList.add("theme-transition");

    // .toggle("dark") agrega la clase si no está, o la quita si ya está.
    // Como Tailwind está configurado con darkMode: 'class', esto basta
    // para que TODAS las clases "dark:" del HTML reaccionen automáticamente.
    htmlEl.classList.toggle("dark");

    const isDark = htmlEl.classList.contains("dark");
    themeIcon.textContent = isDark ? "☀️" : "🌙";

    // Volvemos a dibujar los gráficos para que el texto/grilla cambie de color
    dashboard.refreshChartsTheme(cachedContinents, cachedCountries);

    // Quitamos la clase de transición después de que termine la animación
    setTimeout(() => htmlEl.classList.remove("theme-transition"), 400);
});

/* --- SCROLL REVEAL: anima la galería cuando entra en el viewport --- */
function initScrollReveal() {
    // IntersectionObserver: API nativa del navegador que nos avisa cuando
    // un elemento entra o sale de la pantalla visible, sin tener que
    // escuchar el evento "scroll" manualmente (más eficiente).
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    // Dejamos de observar una vez animado, para no repetir la animación
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.15 } // se activa cuando el 15% del elemento es visible
    );

    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
}

/* --- ARRANQUE: apenas el DOM y este script están listos, iniciamos todo --- */
initApp();