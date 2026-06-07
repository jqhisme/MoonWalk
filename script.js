// Global variables
const BASE_URL = 'http://localhost:5000';
let usingStartVideo = true;
const START_VIDEO_SRC = 'grain.mp4';
const FOOTAGE_VIDEO_SRC = 'footages.mp4';
// Text history handling
const userInput = document.getElementById('user-input');
const inputButton = document.getElementById('input-button');
const textHistory = document.getElementById('text-history');
const mainVideo = document.getElementById('main-video');

// Dial handling
let dialAngle = 0;
const dial = document.getElementById('dial');
const dialIndicator = document.getElementById('dial-indicator');
const dialValue = document.getElementById('dial-value');
let isDraggingDial = false;
// On page load, set video to grain.mp4 and loop
window.addEventListener('DOMContentLoaded', () => {
    if (mainVideo) {
        mainVideo.src = START_VIDEO_SRC;
        mainVideo.loop = true;
        mainVideo.load();
        mainVideo.play();
        usingStartVideo = true;
    }
    
    // Initialize dial event listeners
    setupDialListeners();
});

// Helper function to convert HH:MM:SS to seconds
function timeToSeconds(timeStr) {
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
}

// Helper function to setup video looping for an interval  
function setVideoInterval(startTime, endTime) {
    if (!startTime || !endTime) return;
    
    // Set initial position to start time
    mainVideo.currentTime = startTime;
    
    // Remove any existing timeupdate listener
    mainVideo.ontimeupdate = null;
    
    // Add listener to loop the interval
    mainVideo.ontimeupdate = function() {
        if (mainVideo.currentTime >= endTime) {
            mainVideo.currentTime = startTime;
        }
    };
    
    // Start playing
    mainVideo.play();
}

// Save query data to Firebase
async function saveToFirebase(queryText, interval, highlight, coordinate) {
    try {
        const docRef = await window.firebaseAddDoc(window.firebaseCollection(window.firebaseDB, 'queries'), {
            query_text: queryText,
            interval: interval,
            highlight: highlight,
            coordinate: coordinate,
            timestamp: window.firebaseServerTimestamp()
        });
        console.log('Document written with ID: ', docRef.id);
    } catch (error) {
        console.error('Error adding document: ', error);
    }
}

// Loop video through a sequence of intervals, repeating indefinitely
function loopVideoIntervals(intervals) {
    if (!intervals || intervals.length === 0) return;
    let currentIdx = 0;

    function playCurrentInterval() {
        let { start, end, center } = intervals[currentIdx];
        
        // Apply dial scaling to this interval
        const angleRatio = 1 - dialAngle / 360;
        const intervalDuration = end - start;
        const scaledDuration = Math.max(0.25, 0.25 + angleRatio * (intervalDuration - 1));
        
        // Center the scaled interval around the specified center, handling overflow
        let scaledStartTime = center - scaledDuration / 2;
        let scaledEndTime = center + scaledDuration / 2;
        
        // Handle overflow by expanding in the opposite direction
        if (scaledStartTime < start) {
            const overflow = start - scaledStartTime;
            scaledStartTime = start;
            scaledEndTime = Math.min(end, scaledEndTime + overflow);
        }
        if (scaledEndTime > end) {
            const overflow = scaledEndTime - end;
            scaledEndTime = end;
            scaledStartTime = Math.max(start, scaledStartTime - overflow);
        }
        
        mainVideo.currentTime = scaledStartTime;
        mainVideo.ontimeupdate = null;
        mainVideo.ontimeupdate = function() {
            if (mainVideo.currentTime >= scaledEndTime) {
                // Move to next interval
                currentIdx = (currentIdx + 1) % intervals.length;
                playCurrentInterval();
            }
        };
        mainVideo.play();
    }
    playCurrentInterval();
}

inputButton.addEventListener('click', addTextEntry);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addTextEntry();
    }
});

// Dial interaction functions
function setupDialListeners() {
    dial.addEventListener('mousedown', startDraggingDial);
    dial.addEventListener('mousemove', updateDialOnMove);
    dial.addEventListener('click', updateDialOnClick);
    document.addEventListener('mouseup', stopDraggingDial);
    document.addEventListener('mousemove', dragDialWhileMoving);
}

function getDialAngleFromEvent(e) {
    const rect = dial.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90; // +90 to start from top
    if (angle < 0) angle += 360;
    return Math.round(angle);
}

function startDraggingDial(e) {
    isDraggingDial = true;
}

function stopDraggingDial() {
    isDraggingDial = false;
}

function dragDialWhileMoving(e) {
    if (!isDraggingDial) return;
    dialAngle = getDialAngleFromEvent(e);
    updateDialDisplay();
}

function updateDialOnMove(e) {
    if (isDraggingDial) {
        dialAngle = getDialAngleFromEvent(e);
        updateDialDisplay();
    }
}

function updateDialOnClick(e) {
    dialAngle = getDialAngleFromEvent(e);
    updateDialDisplay();
}

function updateDialDisplay() {
    // Clamp angle between 0 and 360
    let clampedAngle = dialAngle % 360;
    if (clampedAngle < 0) clampedAngle += 360;
    
    // Calculate position of indicator circle around the dial
    const radius = 70; // Distance from center
    const radians = (clampedAngle - 90) * (Math.PI / 180); // -90 to start from top
    const x = 100 + radius * Math.cos(radians);
    const y = 100 + radius * Math.sin(radians);
    
    // Update indicator circle position
    dialIndicator.setAttribute('cx', x);
    dialIndicator.setAttribute('cy', y);
    
    // Update value display
    dialValue.textContent = `${clampedAngle}°`;
}

function addTextEntry() {
    // If using grain.mp4, switch to footages.mp4 and remove loop
    if (usingStartVideo && mainVideo) {
        mainVideo.src = FOOTAGE_VIDEO_SRC;
        mainVideo.loop = false;
        mainVideo.load();
        usingStartVideo = false;
    }
    
    const text = userInput.value.trim();
    if (text === '') return;

    // Split input by semicolons for multi-query
    const queries = text.split(';').map(q => q.trim()).filter(q => q.length > 0);
    if (queries.length === 0) return;

    // Clear input
    userInput.value = '';

    // Create entry elements for each query (only show text, no coordinates/timestamps)
    const entryElements = queries.map(q => {
        const entry = document.createElement('div');
        entry.className = 'text-entry';
        entry.textContent = q;
        textHistory.insertBefore(entry, textHistory.firstChild);
        return entry;
    });

    // Send all queries as a single string to /api/query_multiple
    const payload = { query: queries.join(';') };

    // Store intervals for video looping
    let intervals = [];

    // Fetch highlight intervals for all queries
    fetch(`${BASE_URL}/api/query_multiple`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(dataArr => {
        // dataArr is an array of results, one per query
        dataArr.forEach((data, idx) => {
            let topHighlight = data.highlight || '';
            let intervalStr = data.interval || '';

            // 50% chance to use highlight +- random(2,8) seconds as interval for looping
            let useInterval = Math.random() < 0.5;
            if(useInterval && intervalStr) {
                // Using topInterval
                const [startTime, endTime] = intervalStr.split(' - ').map(timeToSeconds);
                const highlightSeconds = timeToSeconds(topHighlight);
                
                let center;
                if (!isNaN(highlightSeconds) && highlightSeconds >= startTime && highlightSeconds <= endTime) {
                    // topHighlight is within the interval, use it as center
                    center = highlightSeconds;
                } else {
                    // Use middle of the interval as center
                    center = (startTime + endTime) / 2;
                }
                
                if (!isNaN(startTime) && !isNaN(endTime)) {
                    intervals.push({ start: startTime, end: endTime, center: center });
                }
            } else { // use highlight
                const highlightSeconds = timeToSeconds(topHighlight);
                if (!isNaN(highlightSeconds)) {
                    let startTime = highlightSeconds - Math.floor(Math.random() * 7) - 2; // random between 2 and 8 seconds before
                    let endTime = highlightSeconds + Math.floor(Math.random() * 7) + 2; // random between 2 and 8 seconds after
                    startTime = Math.max(0, startTime); // Ensure start is not negative
                    // For highlight-based intervals, center is the highlight time
                    intervals.push({ start: startTime, end: endTime, center: highlightSeconds });
                }
            }

            // Fetch embedding for each query and save to Firebase
            fetch(`${BASE_URL}/api/text_embed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: queries[idx] })
            })
            .then(response => response.json())
            .then(embedData => {
                if (embedData.reduced_embedding) {
                    const embedding = embedData.reduced_embedding[0] || embedData.reduced_embedding;
                    const coordinates = [embedding[0], embedding[1], embedding[2]];
                    
                    console.log('Saving to Firebase:', {
                        query: queries[idx],
                        interval: intervalStr,
                        highlight: topHighlight,
                        coordinates: coordinates
                    });
                    
                    // Save to Firebase - one entry per query
                    saveToFirebase(queries[idx], intervalStr, topHighlight, coordinates);
                }
            })
            .catch(error => {
                console.error('Error sending text_embed:', error);
            });
        });

        // After all intervals are collected, start looping video
        if (intervals.length > 0) {
            loopVideoIntervals(intervals);
        }
    })
    .catch(error => {
        console.error('Error sending query_multiple:', error);
    });
}
