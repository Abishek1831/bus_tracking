// 🚌 REC BUS TRACKER - FIXED VERSION
// ✅ FIXES: Real-time updates, GPS sync, Map refresh, Progress tracking

const firebaseConfig = {
    apiKey: "AIzaSyBZ_h5BTak_YJ4AbhFLmSbStMvLh-f0Kl8",
    authDomain: "rec-bus-tracking.firebaseapp.com",
    databaseURL: "https://rec-bus-tracking-default-rtdb.firebaseio.com",
    projectId: "rec-bus-tracking",
    storageBucket: "rec-bus-tracking.firebasestorage.app",
    messagingSenderId: "253152097589",
    appId: "1:253152097589:web:7c8987b567a4d2303f487c"
};

// Global Variables
let database = null;
let map = null;
let busMarker = null;
let collegeMarker = null;
let stopMarkers = [];
let routeLine = null;
let routingControl = null;
let currentRoute = null;
let busRoutes = [];
let filteredRoutes = [];
let currentFilter = 'all';
let favorites = JSON.parse(localStorage.getItem('favoriteBuses') || '[]');
let theme = localStorage.getItem('theme') || 'light';
let notificationsEnabled = localStorage.getItem('notificationsEnabled') === 'true';

const REC_COLLEGE = { lat: 13.008865511221579, lng: 80.00247624515674 };

const routeDefinitions = {
    '1': {
        routeNumber: '19',
        routeName: 'SP-Kovil',
        stops: [
            { name: 'SP-Kovil Bus Stand', lat: 12.7650, lng: 80.0046 },
            { name: 'REC College', lat: REC_COLLEGE.lat, lng: REC_COLLEGE.lng }
        ]
    },
    '2': {
        routeNumber: '11A',
        routeName: 'Velachery - REC',
        stops: [
            { name: 'Velachery Bus Depot', lat: 12.9750, lng: 80.2167 },
            { name: 'Phoenix Mall', lat: 12.9816, lng: 80.2203 },
            { name: 'Taramani', lat: 13.0067, lng: 80.2458 },
            { name: 'REC College', lat: REC_COLLEGE.lat, lng: REC_COLLEGE.lng }
        ]
    },
    '3': {
        routeNumber: '1',
        routeName: 'Anna Nagar - REC',
        stops: [
            { name: 'Anna Nagar Tower', lat: 13.0878, lng: 80.2086 },
            { name: 'Koyambedu', lat: 13.0732, lng: 80.1963 },
            { name: 'Vadapalani', lat: 13.0524, lng: 80.2121 },
            { name: 'REC College', lat: REC_COLLEGE.lat, lng: REC_COLLEGE.lng }
        ]
    },
    '4': {
        routeNumber: '1B',
        routeName: 'Adyar - REC',
        stops: [
            { name: 'Adyar Bus Depot', lat: 13.0067, lng: 80.2575 },
            { name: 'Thiruvanmiyur', lat: 12.9830, lng: 80.2586 },
            { name: 'Neelankarai', lat: 12.9520, lng: 80.2590 },
            { name: 'REC College', lat: REC_COLLEGE.lat, lng: REC_COLLEGE.lng }
        ]
    },
    '5': {
        routeNumber: '5',
        routeName: 'T Nagar - REC',
        stops: [
            { name: 'T Nagar Bus Stand', lat: 13.0417, lng: 80.2340 },
            { name: 'Guindy', lat: 13.0067, lng: 80.2206 },
            { name: 'Meenambakkam', lat: 12.9850, lng: 80.1650 },
            { name: 'REC College', lat: REC_COLLEGE.lat, lng: REC_COLLEGE.lng }
        ]
    },
    '6': {
        routeNumber: '2',
        routeName: 'Porur - REC',
        stops: [
            { name: 'Porur Bus Stand', lat: 13.0358, lng: 80.1560 },
            { name: 'Poonamallee', lat: 13.0480, lng: 80.0950 },
            { name: 'Ambattur', lat: 13.1020, lng: 80.1620 },
            { name: 'REC College', lat: REC_COLLEGE.lat, lng: REC_COLLEGE.lng }
        ]
    }
};

function initializeRoutes() {
    busRoutes = Object.keys(routeDefinitions).map(id => {
        const route = routeDefinitions[id];
        return {
            id: id,
            routeNumber: route.routeNumber,
            routeName: route.routeName,
            status: 'offline',
            currentLocation: 'Waiting for GPS...',
            coords: route.stops[0],
            destination: REC_COLLEGE,
            stops: route.stops.map((stop, index) => ({
                ...stop,
                time: calculateStopTime(index, route.stops.length),
                status: 'upcoming',
                distanceFromStart: 0
            })),
            speed: 0,
            lastUpdate: null,
            busCode: '',
            progress: 0,
            totalDistance: 0,
            coveredDistance: 0,
            isFavorite: favorites.includes(id)
        };
    });
    filteredRoutes = [...busRoutes];
}

function calculateStopTime(stopIndex, totalStops) {
    const baseTime = new Date();
    baseTime.setHours(6, 0, 0, 0);
    baseTime.setMinutes(baseTime.getMinutes() + (stopIndex * 8));
    return baseTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function calculateETA(distance, speed) {
    if (speed === 0 || speed < 5) return 'Calculating...';
    const trafficFactor = 1.15;
    const hours = (distance * trafficFactor) / speed;
    const mins = Math.round(hours * 60);
    if (mins < 1) return 'Arriving now';
    if (mins < 60) return `${mins} mins`;
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}h ${remainingMins}m`;
}

// ✅ FIXED: Better route progress calculation
function calculateRouteProgress(route) {
    if (!route || route.status !== 'active') return 0;
    
    let totalDist = 0;
    for (let i = 0; i < route.stops.length - 1; i++) {
        totalDist += calculateDistance(
            route.stops[i].lat, route.stops[i].lng,
            route.stops[i + 1].lat, route.stops[i + 1].lng
        );
    }
    
    let minDist = Infinity;
    let closestStopIndex = 0;
    route.stops.forEach((stop, index) => {
        const dist = calculateDistance(
            route.coords.lat, route.coords.lng,
            stop.lat, stop.lng
        );
        if (dist < minDist) {
            minDist = dist;
            closestStopIndex = index;
        }
    });
    
    let coveredDist = 0;
    for (let i = 0; i < closestStopIndex; i++) {
        coveredDist += calculateDistance(
            route.stops[i].lat, route.stops[i].lng,
            route.stops[i + 1].lat, route.stops[i + 1].lng
        );
    }
    
    if (closestStopIndex > 0) {
        const segmentStart = route.stops[closestStopIndex - 1];
        const distFromPrevStop = calculateDistance(
            segmentStart.lat, segmentStart.lng,
            route.coords.lat, route.coords.lng
        );
        coveredDist += distFromPrevStop;
    }
    
    route.totalDistance = totalDist;
    route.coveredDistance = coveredDist;
    const progress = Math.min(Math.round((coveredDist / totalDist) * 100), 100);
    route.progress = progress;
    
    return progress;
}

// ✅ FIXED: Improved stop status update logic
function updateStopStatuses(route) {
    let closestStopIndex = 0;
    let minDistance = Infinity;
    
    route.stops.forEach((stop, index) => {
        const distance = calculateDistance(
            route.coords.lat, route.coords.lng,
            stop.lat, stop.lng
        );
        
        if (distance < minDistance) {
            minDistance = distance;
            closestStopIndex = index;
        }
    });
    
    // ✅ Increased threshold for better detection
    const threshold = 0.5; // 500 meters
    
    // Check if bus is back at starting point
    const distanceFromStart = calculateDistance(
        route.coords.lat, route.coords.lng,
        route.stops[0].lat, route.stops[0].lng
    );
    
    if (distanceFromStart < 0.3 && closestStopIndex === 0) {
        route.stops.forEach((stop, index) => {
            if (index === 0) {
                stop.status = 'current';
            } else {
                stop.status = 'upcoming';
                delete stop.eta;
            }
        });
        route.currentLocation = route.stops[0].name;
        route.progress = 0;
        
        console.log(`🔄 Route ${route.routeNumber} reset at start`);
        
        if (route.isFavorite && notificationsEnabled) {
            showNotification(`🔄 Route ${route.routeNumber} returned to start`, 'info');
        }
        
        return route;
    }
    
    // Update stop statuses based on proximity
    route.stops.forEach((stop, index) => {
        const distance = calculateDistance(
            route.coords.lat, route.coords.lng,
            stop.lat, stop.lng
        );
        
        if (index < closestStopIndex) {
            stop.status = 'passed';
        } else if (index === closestStopIndex) {
            if (distance < threshold) {
                stop.status = 'current';
                route.currentLocation = stop.name;
                
                if (route.isFavorite && notificationsEnabled) {
                    showNotification(`Bus ${route.routeNumber} at ${stop.name}`, 'info');
                }
            } else {
                stop.status = 'current';
                route.currentLocation = `Approaching ${stop.name}`;
            }
        } else {
            stop.status = 'upcoming';
            
            // Calculate ETA for next stop
            if (index === closestStopIndex + 1) {
                const distToNext = calculateDistance(
                    route.coords.lat, route.coords.lng,
                    stop.lat, stop.lng
                );
                stop.eta = calculateETA(distToNext, route.speed);
            }
        }
    });
    
    calculateRouteProgress(route);
    
    return route;
}

function toggleTheme() {
    theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    if (map) {
        map.eachLayer((layer) => {
            if (layer instanceof L.TileLayer) {
                map.removeLayer(layer);
            }
        });
        
        const tileUrl = theme === 'dark' 
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        
        L.tileLayer(tileUrl, {
            attribution: '© OpenStreetMap © CartoDB',
            maxZoom: 19
        }).addTo(map);
    }
    
    showNotification(`${theme === 'dark' ? '🌙' : '☀️'} ${theme.charAt(0).toUpperCase() + theme.slice(1)} mode`, 'success');
}

function showNotification(message, type = 'info') {
    if (typeof toastr !== 'undefined') {
        toastr.options = {
            closeButton: true,
            progressBar: true,
            positionClass: 'toast-top-right',
            timeOut: 4000
        };
        toastr[type](message);
    } else {
        console.log(message);
    }
}

function toggleFavorite(routeId, event) {
    event.stopPropagation();
    const route = busRoutes.find(r => r.id === routeId);
    if (!route) return;
    
    route.isFavorite = !route.isFavorite;
    
    if (route.isFavorite) {
        if (!favorites.includes(routeId)) {
            favorites.push(routeId);
            showNotification(`⭐ Route ${route.routeNumber} favorited`, 'success');
        }
    } else {
        favorites = favorites.filter(id => id !== routeId);
        showNotification(`Route ${route.routeNumber} unfavorited`, 'info');
    }
    
    localStorage.setItem('favoriteBuses', JSON.stringify(favorites));
    renderRoutes();
}

function showFavorites() {
    if (favorites.length === 0) {
        showNotification('No favorites yet!', 'info');
        return;
    }
    
    filteredRoutes = busRoutes.filter(r => favorites.includes(r.id));
    renderRoutes();
}

function showHelpline() {
    alert(`🚌 REC Transport Helpline\n\n📞 Main: 044 6718 1069\n📧 Email: transport@rec.ac.in\n⏰ Hours: 7AM - 7PM\n\n🚨 Emergency: 9876543210`);
}

document.addEventListener('DOMContentLoaded', function() {
    document.documentElement.setAttribute('data-theme', theme);
    
    initializeRoutes();
    
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        console.log('✅ Firebase connected');
        
        document.getElementById('firebaseStatus').innerHTML = '🟢 Connected';
        document.getElementById('firebaseStatus').classList.remove('connecting');
        document.getElementById('firebaseStatus').classList.add('connected');
        
        listenToGPSUpdates();
    } else {
        console.warn('⚠️ Firebase not loaded');
        document.getElementById('firebaseStatus').innerHTML = '❌ Offline';
    }
    
    updateClock();
    renderRoutes();
    updateStats();
    
    setInterval(updateClock, 1000);
});

function updateClock() {
    const now = new Date();
    document.getElementById('time').textContent = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });
    document.getElementById('date').textContent = now.toLocaleDateString('en-US', { 
        weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' 
    });
}

function updateStats() {
    const activeBuses = busRoutes.filter(r => r.status === 'active').length;
    document.getElementById('activeBusCount').textContent = activeBuses;
    
    const activeRoutes = busRoutes.filter(r => r.status === 'active');
    if (activeRoutes.length > 0) {
        const avgDist = activeRoutes.reduce((sum, r) => {
            const dist = calculateDistance(r.coords.lat, r.coords.lng, REC_COLLEGE.lat, REC_COLLEGE.lng);
            return sum + dist;
        }, 0) / activeRoutes.length;
        document.getElementById('avgDistanceC').textContent = avgDist.toFixed(1) + ' km';
        
        const avgSpeed = activeRoutes.reduce((sum, r) => sum + r.speed, 0) / activeRoutes.length;
        document.getElementById('avgSpeed').textContent = Math.round(avgSpeed);
    } else {
        document.getElementById('avgDistanceC').textContent = '0 km';
        document.getElementById('avgSpeed').textContent = '0';
    }
}

function renderRoutes() {
    const routesList = document.getElementById('routesList');
    document.getElementById('routeCount').textContent = `${filteredRoutes.length} Routes`;
    
    routesList.innerHTML = filteredRoutes.map(route => `
        <div class="route-card ${currentRoute && currentRoute.id === route.id ? 'active' : ''} ${route.status === 'offline' ? 'offline' : ''}" 
             onclick="selectRoute('${route.id}')">
            <span class="favorite-icon" onclick="toggleFavorite('${route.id}', event)">
                ${route.isFavorite ? '⭐' : '☆'}
            </span>
            
            <div class="route-header">
                <div>
                    <div class="route-name">${route.routeName}</div>
                    <span class="route-code">Route ${route.routeNumber}</span>
                </div>
                <span class="status-badge status-${route.status}">
                    ${route.status === 'active' ? '🟢 Active' : '⚫ Offline'}
                </span>
            </div>
            
            ${route.status === 'active' ? `
                <div class="bus-info">
                    <div class="bus-detail">⚡ ${Math.round(route.speed)} km/h</div>
                    <div class="bus-detail">📍 Live GPS</div>
                </div>
                
                <div class="current-loc">📍 ${route.currentLocation}</div>
                
                <div class="progress-bar-mini">
                    <div class="progress-fill-mini" style="width: ${route.progress || 0}%"></div>
                </div>
                
                <div class="eta-section">
                    <div class="eta">⏱️ ${route.eta || 'Calculating...'}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${route.progress || 0}% Done</div>
                </div>
            ` : `
                <div class="current-loc" style="text-align: center; color: var(--text-secondary);">
                    Bus not started
                </div>
            `}
        </div>
    `).join('');
}

function selectRoute(routeId) {
    currentRoute = busRoutes.find(r => r.id === routeId);
    renderRoutes();
    showRouteDetails();
    
    if (window.innerWidth <= 768) {
        document.getElementById('detailsContainer').classList.add('mobile-fullscreen');
        document.querySelector('.content').classList.add('mobile-details-open');
        document.body.style.overflow = 'hidden';
        window.history.pushState({ mobilePage: true }, '');
    }
}

window.addEventListener('popstate', function(event) {
    if (document.getElementById('detailsContainer').classList.contains('mobile-fullscreen')) {
        closeMobileDetails();
        window.history.pushState({ mainPage: true }, '');
    }
});

window.addEventListener('load', function() {
    window.history.pushState({ mainPage: true }, '');
});

function closeMobileDetails() {
    document.getElementById('detailsContainer').classList.remove('mobile-fullscreen');
    document.querySelector('.content').classList.remove('mobile-details-open');
    document.body.style.overflow = 'auto';
    
    document.getElementById('detailsContainer').innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">🚌</div>
            <h2>Welcome to REC Live Bus Tracking</h2>
            <p>Select a route to view real-time tracking</p>
            <div class="welcome-features">
                <div class="feature-item">📍 Live GPS Tracking</div>
                <div class="feature-item">🗺️ Real-time Route Progress</div>
                <div class="feature-item">⏱️ Accurate ETA</div>
                <div class="feature-item">🔔 Smart Notifications</div>
            </div>
        </div>
    `;
    
    currentRoute = null;
    if (map) {
        map.remove();
        map = null;
    }
    renderRoutes();
}

function showRouteDetails() {
    if (!currentRoute) return;
    
    const mobileBackButton = window.innerWidth <= 768 ? 
        '<div class="mobile-back-button" onclick="closeMobileDetails()">← Back to Routes</div>' : '';
    
    const distance = calculateDistance(
        currentRoute.coords.lat, currentRoute.coords.lng,
        REC_COLLEGE.lat, REC_COLLEGE.lng
    );
    
    currentRoute.eta = calculateETA(distance, currentRoute.speed || 40);
    
    document.getElementById('detailsContainer').innerHTML = `
        ${mobileBackButton}
        <div class="panel-header">
            <h2 class="panel-title">Route ${currentRoute.routeNumber} - ${currentRoute.routeName}</h2>
            <div class="panel-subtitle">
                <span class="subtitle-item">🚦 ${currentRoute.status === 'active' ? 'Active' : 'Offline'}</span>
                ${currentRoute.isFavorite ? '<span class="subtitle-item">⭐ Favorite</span>' : ''}
            </div>
        </div>

        ${currentRoute.status === 'active' ? `
            <div class="gps-indicator">
                <div class="gps-dot"></div>
                Live GPS Active
            </div>

            <div class="info-grid">
                <div class="info-card">
                    <div class="info-label">Speed</div>
                    <div class="info-value">${Math.round(currentRoute.speed)} km/h</div>
                </div>
                <div class="info-card">
                    <div class="info-label">Distance</div>
                    <div class="info-value">${distance.toFixed(1)} km</div>
                </div>
                <div class="info-card">
                    <div class="info-label">ETA</div>
                    <div class="info-value">${currentRoute.eta}</div>
                </div>
            </div>

            <div class="live-status">
                <h3>📍 Live Status</h3>
                <div class="status-grid">
                    <div class="status-item">
                        <div>Location</div>
                        <strong>${currentRoute.currentLocation}</strong>
                    </div>
                    <div class="status-item">
                        <div>Updated</div>
                        <strong>${currentRoute.lastUpdate || 'Just now'}</strong>
                    </div>
                </div>
            </div>

            <div class="map-container">
                <div id="map"></div>
            </div>
        ` : `
            <div style="text-align: center; padding: 50px; color: var(--text-secondary);">
                <h3>🚌 Bus Not Started</h3>
                <p>Waiting for GPS...</p>
            </div>
        `}

        <div class="route-progress">
            <div class="progress-header">
                <h3>🛣️ Route Progress</h3>
                ${currentRoute.status === 'active' ? `<div class="progress-percentage">${currentRoute.progress || 0}%</div>` : ''}
            </div>
            ${currentRoute.stops.map((stop, index) => `
                <div class="stop-item">
                    <div class="stop-indicator">
                        <div class="stop-dot ${stop.status === 'passed' ? 'passed' : ''} ${stop.status === 'current' ? 'current' : ''}">
                            ${stop.status === 'passed' ? '✓' : index + 1}
                        </div>
                        ${index < currentRoute.stops.length - 1 ? 
                            `<div class="stop-line ${stop.status === 'passed' ? 'passed' : ''}"></div>` : ''}
                    </div>
                    <div class="stop-info">
                        <div class="stop-name">
                            ${stop.name}
                            ${stop.status === 'current' ? '<span class="stop-badge badge-current">Current</span>' : ''}
                            ${stop.status === 'passed' ? '<span class="stop-badge badge-passed">Done</span>' : ''}
                            ${stop.status === 'upcoming' && index === currentRoute.stops.findIndex(s => s.status === 'upcoming') ? 
                                `<span class="stop-badge badge-next">Next${stop.eta ? ' - ' + stop.eta : ''}</span>` : ''}
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 3px;">
                            ${stop.status === 'passed' ? '✓ Completed' : stop.time}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    if (currentRoute.status === 'active') {
        setTimeout(() => initMap(), 100);
    }
}

// ✅ FIXED: Better map initialization and updates
function initMap() {
    if (!currentRoute || currentRoute.status !== 'active') return;
    
    if (map) {
        map.remove();
        map = null;
    }
    
    stopMarkers = [];
    
    map = L.map('map', {
        center: [currentRoute.coords.lat, currentRoute.coords.lng],
        zoom: 12,
        zoomControl: true,
        scrollWheelZoom: true
    });
    
    const tileUrl = theme === 'dark' 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    
    L.tileLayer(tileUrl, {
        attribution: '© OpenStreetMap',
        maxZoom: 19
    }).addTo(map);
    
    const busIcon = L.divIcon({
        html: `<div style="background: #1a237e; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 3px solid white;">🚌</div>`,
        className: '',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });
    
    busMarker = L.marker([currentRoute.coords.lat, currentRoute.coords.lng], {
        icon: busIcon,
        zIndexOffset: 1000
    }).addTo(map);
    
    busMarker.bindPopup(`
        <div style="font-family: Arial; min-width: 180px;">
            <strong style="font-size: 16px; color: #1a237e;">Route ${currentRoute.routeNumber}</strong><br>
            <strong style="font-size: 14px; margin-top: 5px; display: block;">${currentRoute.currentLocation}</strong><br>
            <span style="color: #666;">Speed: ${Math.round(currentRoute.speed)} km/h</span><br>
            <span style="color: #666;">Progress: ${currentRoute.progress}%</span>
        </div>
    `).openPopup();
    
    const collegeIcon = L.divIcon({
        html: `<div style="background: #4caf50; width: 45px; height: 45px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 3px solid white;">🏫</div>`,
        className: '',
        iconSize: [45, 45],
        iconAnchor: [22.5, 22.5]
    });
    
    collegeMarker = L.marker([REC_COLLEGE.lat, REC_COLLEGE.lng], {
        icon: collegeIcon
    }).addTo(map);
    
    collegeMarker.bindPopup(`
        <div style="font-family: Arial; text-align: center;">
            <strong style="font-size: 16px; color: #4caf50;">🏫 REC College</strong><br>
            <span style="color: #666;">Thandalam, Chennai</span>
        </div>
    `);
    
    currentRoute.stops.forEach((stop, index) => {
        let stopColor = '#999';
        if (stop.status === 'passed') stopColor = '#28a745';
        if (stop.status === 'current') stopColor = '#1a237e';
        
        const stopIcon = L.divIcon({
            html: `<div style="width: 16px; height: 16px; background: ${stopColor}; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>`,
            className: '',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
        
        const marker = L.marker([stop.lat, stop.lng], {
            icon: stopIcon
        }).addTo(map);
        
        marker.bindPopup(`
            <div style="font-family: Arial;">
                <strong style="color: ${stopColor};">${stop.name}</strong><br>
                <span style="font-size: 12px; color: #666;">
                    ${stop.status === 'passed' ? '✅ Completed' : 
                      stop.status === 'current' ? '🔵 Current' : 
                      '⏳ ' + stop.time}
                </span>
            </div>
        `);
        
        stopMarkers.push(marker);
    });
    
    if (typeof L.Routing !== 'undefined') {
        let waypoints = [L.latLng(currentRoute.coords.lat, currentRoute.coords.lng)];
        
        currentRoute.stops.forEach((stop) => {
            if (stop.status !== 'passed') {
                waypoints.push(L.latLng(stop.lat, stop.lng));
            }
        });
        
        routingControl = L.Routing.control({
            waypoints: waypoints,
            router: L.Routing.osrmv1({
                serviceUrl: 'https://router.project-osrm.org/route/v1',
                profile: 'driving'
            }),
            lineOptions: {
                styles: [
                    {color: '#4285f4', opacity: 0.4, weight: 12},
                    {color: '#1a73e8', opacity: 0.9, weight: 6}
                ]
            },
            show: false,
            addWaypoints: false,
            routeWhileDragging: false,
            draggableWaypoints: false,
            fitSelectedRoutes: false,
            showAlternatives: false,
            createMarker: function() { return null; }
        }).addTo(map);
        
        console.log('🛣️ Route drawn with', waypoints.length, 'points');
    } else {
        const routeCoords = [
            [currentRoute.coords.lat, currentRoute.coords.lng],
            [REC_COLLEGE.lat, REC_COLLEGE.lng]
        ];
        
        routeLine = L.polyline(routeCoords, {
            color: '#1a73e8',
            weight: 6,
            opacity: 0.8
        }).addTo(map);
    }
    
    const allPoints = [
        [currentRoute.coords.lat, currentRoute.coords.lng],
        ...currentRoute.stops.map(s => [s.lat, s.lng])
    ];
    const bounds = L.latLngBounds(allPoints);
    map.fitBounds(bounds, { padding: [60, 60] });
}

// ✅ FIXED: Real-time GPS updates with proper refresh
function listenToGPSUpdates() {
    if (!database) return;
    
    const busesRef = database.ref('buses');
    
    busesRef.on('value', (snapshot) => {
        const data = snapshot.val();
        
        if (data) {
            console.log('📡 GPS update received');
            
            Object.keys(data).forEach(routeId => {
                const gpsData = data[routeId];
                const route = busRoutes.find(r => r.id === routeId);
                
                if (route) {
                    const oldStatus = route.status;
                    
                    route.coords = {
                        lat: gpsData.latitude,
                        lng: gpsData.longitude
                    };
                    route.speed = gpsData.speed || 0;
                    route.status = 'active';
                    route.busCode = gpsData.busCode || '';
                    route.lastUpdate = new Date().toLocaleTimeString('en-US', { 
                        hour: '2-digit', minute: '2-digit' 
                    });
                    
                    updateStopStatuses(route);
                    
                    if (oldStatus === 'offline' && route.isFavorite && notificationsEnabled) {
                        showNotification(`🚌 Route ${route.routeNumber} is now active!`, 'success');
                    }
                    
                    console.log(`✅ Route ${routeId}: ${gpsData.latitude.toFixed(4)}, ${gpsData.longitude.toFixed(4)} @ ${Math.round(gpsData.speed)} km/h`);
                }
            });
            
            // Mark routes as offline if not in Firebase
            busRoutes.forEach(route => {
                if (!data[route.id] && route.status === 'active') {
                    route.status = 'offline';
                    route.currentLocation = 'Waiting for GPS...';
                    console.log(`⚫ Route ${route.id} went offline`);
                }
            });
            
            applyFilters();
            updateStats();
            
            // ✅ CRITICAL: Update map if viewing active route
            if (currentRoute && map && currentRoute.status === 'active') {
                const updatedRoute = busRoutes.find(r => r.id === currentRoute.id);
                if (updatedRoute) {
                    // Update bus marker position
                    if (busMarker) {
                        busMarker.setLatLng([updatedRoute.coords.lat, updatedRoute.coords.lng]);
                        busMarker.setPopupContent(`
                            <div style="font-family: Arial; min-width: 180px;">
                                <strong style="font-size: 16px; color: #1a237e;">Route ${updatedRoute.routeNumber}</strong><br>
                                <strong style="font-size: 14px; margin-top: 5px; display: block;">${updatedRoute.currentLocation}</strong><br>
                                <span style="color: #666;">Speed: ${Math.round(updatedRoute.speed)} km/h</span><br>
                                <span style="color: #666;">Progress: ${updatedRoute.progress}%</span>
                            </div>
                        `);
                        
                        map.panTo([updatedRoute.coords.lat, updatedRoute.coords.lng]);
                    }
                    
                    // Update routing
                    if (routingControl) {
                        let waypoints = [L.latLng(updatedRoute.coords.lat, updatedRoute.coords.lng)];
                        updatedRoute.stops.forEach((stop) => {
                            if (stop.status !== 'passed') {
                                waypoints.push(L.latLng(stop.lat, stop.lng));
                            }
                        });
                        routingControl.setWaypoints(waypoints);
                    } else if (routeLine) {
                        routeLine.setLatLngs([
                            [updatedRoute.coords.lat, updatedRoute.coords.lng],
                            [REC_COLLEGE.lat, REC_COLLEGE.lng]
                        ]);
                    }
                    
                    // Update stop markers
                    stopMarkers.forEach((marker, index) => {
                        const stop = updatedRoute.stops[index];
                        let stopColor = '#999';
                        if (stop.status === 'passed') stopColor = '#28a745';
                        if (stop.status === 'current') stopColor = '#1a237e';
                        
                        const stopIcon = L.divIcon({
                            html: `<div style="width: 16px; height: 16px; background: ${stopColor}; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>`,
                            className: '',
                            iconSize: [16, 16],
                            iconAnchor: [8, 8]
                        });
                        
                        marker.setIcon(stopIcon);
                    });
                    
                    // Refresh details panel
                    showRouteDetails();
                }
            }
        }
    });
    
    console.log('👂 Listening for GPS updates...');
}

function filterRoutes() {
    applyFilters();
}

function filterStatus(status, event) {
    currentFilter = status;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.target) {
        event.target.classList.add('active');
    }
    applyFilters();
}

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    filteredRoutes = busRoutes.filter(route => {
        const matchesSearch = 
            route.routeNumber.toLowerCase().includes(searchTerm) ||
            route.routeName.toLowerCase().includes(searchTerm) ||
            route.currentLocation.toLowerCase().includes(searchTerm);
        
        const matchesFilter = 
            currentFilter === 'all' || route.status === currentFilter;
        
        return matchesSearch && matchesFilter;
    });
    
    renderRoutes();
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    applyFilters();
}

function shareCurrentBus() {
    if (!currentRoute || currentRoute.status !== 'active') {
        showNotification('⚠️ Please select an active bus route first!', 'info');
        return;
    }
    
    const distance = calculateDistance(
        currentRoute.coords.lat, 
        currentRoute.coords.lng, 
        REC_COLLEGE.lat, 
        REC_COLLEGE.lng
    );
    
    const shareText = `🚌 REC Bus Route ${currentRoute.routeNumber} - ${currentRoute.routeName}

📍 Current Location: ${currentRoute.currentLocation}
⚡ Speed: ${Math.round(currentRoute.speed)} km/h
📏 Distance to College: ${distance.toFixed(1)} km
⏱️ ETA: ${currentRoute.eta || 'Calculating...'}
🔋 Progress: ${currentRoute.progress}%

🔗 Track live: https://rectransport.com`;
    
    document.getElementById('shareText').textContent = shareText;
    document.getElementById('shareModal').classList.add('active');
}

function closeShareModal() {
    document.getElementById('shareModal').classList.remove('active');
}

function copyShareLink() {
    const text = document.getElementById('shareText').textContent;
    navigator.clipboard.writeText(text);
    showNotification('📋 Copied!', 'success');
}

function whatsappShare() {
    const text = encodeURIComponent(document.getElementById('shareText').textContent);
    window.open(`https://wa.me/?text=${text}`, '_blank');
}