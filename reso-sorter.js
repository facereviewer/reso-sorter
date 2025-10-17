// ==UserScript==
// @name         Sort Resolutions in Google Reverse Search
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Finds written resolutions (with dots or commas) on specific Google search pages, sorts them by pixel area, and displays them in a scrollable, sortable table.
// @author       Grok
// @match        https://www.google.com/search?sca_esv*
// @match        https://www.google.com/search?sa=X*
// @match        https://www.google.com/search?lns_surface*
// @match        https://www.google.com/search?tbnid=*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Create styles for the floating table
    const styles = `
        :root {
            --bg-color: #fff;
            --text-color: #333;
            --border-color: #ccc;
            --header-bg: #f4f4f4;
            --header-hover-bg: #e0e0e0;
            --row-even-bg: #f9f9f9;
            --link-color: #013220;
        }
        .dark-theme {
            --bg-color: #333;
            --text-color: #eee;
            --border-color: #555;
            --header-bg: #444;
            --header-hover-bg: #666;
            --row-even-bg: #3a3a3a;
            --link-color: #90ee90;
        }

        #resolutionTableContainer {
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--bg-color);
            border: 1px solid var(--border-color);
            padding: 10px;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            max-height: 80vh;
            max-width: 600px;
            font-family: Arial, sans-serif;
            color: var(--text-color);
            resize: both; /* Enable resizing */
            overflow: auto; /* Allow scrollbars when content overflows */
            min-width: 300px;
            min-height: 150px;
        }
        #resolutionTableContainer.collapsed {
            max-height: 40px; /* Only show header when collapsed */
            overflow: hidden;
            resize: none;
        }
        #resolutionTableHeader {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            cursor: grab; /* Indicate draggable */
            background: var(--header-bg);
            padding: 5px;
            border-bottom: 1px solid var(--border-color);
        }
        #resolutionTableHeader h3 {
            margin: 0;
            color: var(--text-color);
            font-size: 1em;
        }
        #resolutionTableControls {
            display: flex;
            gap: 5px;
        }
        .theme-button, #collapseButton {
            background: var(--header-bg);
            border: 1px solid var(--border-color);
            color: var(--text-color);
            padding: 3px 8px;
            cursor: pointer;
            border-radius: 3px;
            font-size: 0.8em;
        }
        .theme-button:hover, #collapseButton:hover {
            background: var(--header-hover-bg);
        }

        #resolutionTable {
            border-collapse: collapse;
            width: 100%;
            min-width: 500px;
        }
        #resolutionTable th, #resolutionTable td {
            border: 1px solid var(--border-color);
            padding: 8px;
            text-align: left;
        }
        #resolutionTable th {
            background: var(--header-bg);
            cursor: pointer;
            color: var(--text-color);
        }
        #resolutionTable th:hover {
            background: var(--header-hover-bg);
        }
        #resolutionTable tr:nth-child(even) {
            background: var(--row-even-bg);
        }
        #resolutionTable a {
            color: var(--link-color);
            text-decoration: none;
        }
        #resolutionTable a:hover {
            text-decoration: underline;
        }
        #resolutionTable th[data-sort="link"], #resolutionTable td:nth-child(5) {
            width: 150px;
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `;

    // Add styles to the page
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);

    // Regular expression for resolutions (dots, commas, or plain, plus p formats)
    const resolutionPattern = /\b(\d{1,3}(?:[.,]\d{3})*x\d{1,3}(?:[.,]\d{3})*)\b|\b(\d{1,3}(?:[.,]\d{3})*p)\b/gi;

    // Function to find resolutions in an element's text and get associated link
    function findResolutionsInElement(element) {
        const text = element.textContent || '';
        const matches = text.match(resolutionPattern) || [];
        const link = element.closest('a') ? element.closest('a').href : 'No link';
        return matches.map(res => ({ resolution: res, link }));
    }

    // Collect resolutions from all elements
    const allElements = document.getElementsByTagName('*');
    let resolutionsWithLinks = [];

    for (let element of allElements) {
        resolutionsWithLinks = resolutionsWithLinks.concat(findResolutionsInElement(element));
    }

    // Deduplicate resolutions, preferring those with links
    const resolutionMap = new Map();
    resolutionsWithLinks.forEach(item => {
        const key = item.resolution.toLowerCase();
        const existing = resolutionMap.get(key);
        if (!existing || (existing.link === 'No link' && item.link !== 'No link')) {
            resolutionMap.set(key, item);
        }
    });

    // Process resolutions and calculate pixel area
    const resolutions = Array.from(resolutionMap.values()).map(item => {
        const cleanRes = item.resolution.replace(/[.,]/g, '');
        let width, height;
        if (cleanRes.includes('x')) {
            [width, height] = cleanRes.split('x').map(Number);
        } else if (cleanRes.endsWith('p')) {
            height = Number(cleanRes.replace('p', ''));
            width = Math.round(height * 16 / 9); // Assume 16:9 for p formats
        } else {
            return null;
        }
        // Filter out invalid resolutions
        if (width > 10 && height > 10 && width * height > 1000) {
            return { original: item.resolution, width, height, area: width * height, link: item.link };
        }
        return null;
    }).filter(res => res !== null);

    // Sort by area (descending)
    resolutions.sort((a, b) => b.area - a.area);

    // Create table container
    const container = document.createElement('div');
    container.id = 'resolutionTableContainer';
    document.body.appendChild(container);

    // Create header
    const header = document.createElement('div');
    header.id = 'resolutionTableHeader';
    header.innerHTML = `
        <h3>Resolution Sorter</h3>
        <div id="resolutionTableControls">
            <button class="theme-button" data-theme="light">Light</button>
            <button class="theme-button" data-theme="dark">Dark</button>
            <button id="collapseButton">-</button>
        </div>
    `;
    container.appendChild(header);

    // Create table
    const table = document.createElement('table');
    table.id = 'resolutionTable';
    container.appendChild(table);

    // Create table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th data-sort="original">Resolution</th>
            <th data-sort="width">Width</th>
            <th data-sort="height">Height</th>
            <th data-sort="area">Area (pixels)</th>
            <th data-sort="link">Link</th>
        </tr>
    `;
    table.appendChild(thead);

    // Create table body
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);

    // Populate table
    function populateTable(data) {
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">No valid resolutions found.</td></tr>';
            return;
        }
        data.forEach(r => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${r.original}</td>
                <td>${r.width}</td>
                <td>${r.height}</td>
                <td>${r.area.toLocaleString()}</td>
                <td title="${r.link}">${r.link === 'No link' ? 'No link' : `<a href="${r.link}" target="_blank">${r.link}</a>`}</td>
            `;
            tbody.appendChild(row);
        });
    }

    // Initial population
    populateTable(resolutions);

    // Add sorting functionality
    thead.querySelectorAll('th').forEach(th => {
        th.addEventListener('click', () => {
            const sortKey = th.dataset.sort;
            const isAscending = th.classList.toggle('asc');
            resolutions.sort((a, b) => {
                let valA = a[sortKey];
                let valB = b[sortKey];
                if (sortKey === 'area' || sortKey === 'width' || sortKey === 'height') {
                    valA = Number(valA);
                    valB = Number(valB);
                } else {
                    valA = valA.toString().toLowerCase();
                    valB = valB.toString().toLowerCase();
                }
                return isAscending ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
            });
            populateTable(resolutions);
        });
    });

    // Make the container draggable
    let isDragging = false;
    let offsetX, offsetY;

    header.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - container.getBoundingClientRect().left;
        offsetY = e.clientY - container.getBoundingClientRect().top;
        container.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        container.style.left = `${e.clientX - offsetX}px`;
        container.style.top = `${e.clientY - offsetY}px`;
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        container.style.cursor = 'grab';
    });

    // Theme switching
    const themeButtons = document.querySelectorAll('.theme-button');
    const savedTheme = localStorage.getItem('resolutionTableTheme');

    function setTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
            container.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
            container.classList.remove('dark-theme');
        }
        localStorage.setItem('resolutionTableTheme', theme);
    }

    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        setTheme('light'); // Default theme
    }

    themeButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            setTheme(e.target.dataset.theme);
        });
    });

    // Collapse functionality
    const collapseButton = document.getElementById('collapseButton');
    const savedCollapseState = localStorage.getItem('resolutionTableCollapsed');

    function toggleCollapse() {
        const isCollapsed = container.classList.toggle('collapsed');
        collapseButton.textContent = isCollapsed ? '+' : '-';
        localStorage.setItem('resolutionTableCollapsed', isCollapsed);
    }

    if (savedCollapseState === 'true') {
        container.classList.add('collapsed');
        collapseButton.textContent = '+';
    } else {
        collapseButton.textContent = '-';
    }

    collapseButton.addEventListener('click', toggleCollapse);
})();
