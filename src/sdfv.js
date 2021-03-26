// Copyright 2019-2021 ETH Zurich and the DaCe authors. All rights reserved.

import { parse_sdfg } from "./utils/sdfg/json_serializer";
import { sdfg_property_to_string } from "./utils/sdfg/sdfg_property_to_string";
import { traverse_sdfg_scopes } from "./utils/sdfg/traverse_sdfg_scopes";
import { mean, median } from 'mathjs';
import { SDFGRenderer } from './renderer/renderer';
import { GenericSdfgOverlay } from "./overlays/generic_sdfg_overlay";
const { $ } = globalThis;

let fr;
let file = null;
let instrumentation_file = null;
let renderer = null;


if (document.currentScript.hasAttribute('data-sdfg-json')) {
    init_sdfv(parse_sdfg(document.currentScript.getAttribute('data-sdfg-json')));
} else {
    const url = getParameterByName('url');
    if (url)
        load_sdfg_from_url(url);
    else
        init_sdfv(null);
}


function init_sdfv(sdfg, user_transform = null, debug_draw = false) {
    $('#sdfg-file-input').change((e) => {
        if (e.target.files.length < 1)
            return;
        file = e.target.files[0];
        reload_file();
    });
    $('#menuclose').click(() => close_menu());
    $('#reload').click(() => {
        reload_file();
    });
    $('#instrumentation-report-file-input').change((e) => {
        if (e.target.files.length < 1)
            return;
        instrumentation_file = e.target.files[0];
        load_instrumentation_report();
    });
    $('#outline').click(() => {
        if (renderer)
            setTimeout(() => outline(renderer, renderer.graph), 1);
    });
    $('#search-btn').click(() => {
        if (renderer)
            setTimeout(() => {
                find_in_graph(renderer, renderer.graph, $('#search').val(),
                    $('#search-case')[0].checked);
            }, 1);
    });
    $('#search').on('keydown', (e) => {
        if (e.key == 'Enter' || e.which == 13) {
            if (renderer)
                setTimeout(() => {
                    find_in_graph(renderer, renderer.graph, $('#search').val(),
                        $('#search-case')[0].checked);
                }, 1);
            e.preventDefault();
        }
    });

    if (sdfg !== null)
        renderer = new SDFGRenderer(sdfg, document.getElementById('contents'),
            mouse_event, user_transform, debug_draw);
}

function reload_file() {
    if (!file)
        return;
    fr = new FileReader();
    fr.onload = file_read_complete;
    fr.readAsText(file);
}

function file_read_complete() {
    const sdfg = parse_sdfg(fr.result);
    if (renderer)
        renderer.destroy();
    renderer = new SDFGRenderer(sdfg, document.getElementById('contents'), mouse_event);
    close_menu();
}

function load_instrumentation_report() {
    if (!instrumentation_file)
        return;
    fr = new FileReader();
    fr.onload = load_instrumentation_report_callback;
    fr.readAsText(instrumentation_file);
}

function load_instrumentation_report_callback() {
    instrumentation_report_read_complete(JSON.parse(fr.result));
}

/**
 * Get the min/max values of an array.
 * This is more stable than Math.min/max for large arrays, since Math.min/max
 * is recursive and causes a too high stack-length with long arrays.
 */
function get_minmax(arr) {
    let max = -Number.MAX_VALUE;
    let min = Number.MAX_VALUE;
    arr.forEach(val => {
        if (val > max)
            max = val;
        if (val < min)
            min = val;
    });
    return [min, max];
}

function instrumentation_report_read_complete(report) {
    const runtime_map = {};

    if (report.traceEvents && renderer && renderer.sdfg) {
        for (const event of report.traceEvents) {
            if (event.ph === 'X') {
                let uuid = event.args.sdfg_id + '/';
                if (event.args.state_id !== undefined) {
                    uuid += event.args.state_id + '/';
                    if (event.args.id !== undefined)
                        uuid += event.args.id + '/-1';
                    else
                        uuid += '-1/-1';
                } else {
                    uuid += '-1/-1/-1';
                }

                if (runtime_map[uuid] !== undefined)
                    runtime_map[uuid].push(event.dur);
                else
                    runtime_map[uuid] = [event.dur];
            }
        }

        for (const key in runtime_map) {
            const values = runtime_map[key];
            const minmax = get_minmax(values);
            const min = minmax[0];
            const max = minmax[1];
            const runtime_summary = {
                'min': min,
                'max': max,
                'mean': mean(values),
                'med': median(values),
                'count': values.length,
            };
            runtime_map[key] = runtime_summary;
        }

        if (renderer.overlay_manager) {
            if (!renderer.overlay_manager.runtime_us_overlay_active)
                renderer.overlay_manager.register_overlay(
                    GenericSdfgOverlay.OVERLAY_TYPE.RUNTIME_US
                );
            const ol = renderer.overlay_manager.get_overlay(
                GenericSdfgOverlay.OVERLAY_TYPE.RUNTIME_US
            );
            if (ol) {
                ol.runtime_map = runtime_map;
                ol.refresh();
            }
        }
    }
}

// https://stackoverflow.com/a/901144/6489142
function getParameterByName(name) {
    const url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

function load_sdfg_from_url(url) {
    const request = new XMLHttpRequest();
    request.responseType = 'text'; // Will be parsed as JSON by parse_sdfg
    request.onload = () => {
        if (request.status == 200) {
            const sdfg = parse_sdfg(request.response);
            if (renderer)
                renderer.destroy();
            init_sdfv(sdfg);
        } else {
            alert("Failed to load SDFG from URL");
            init_sdfv(null);
        }
    };
    request.onerror = () => {
        alert("Failed to load SDFG from URL: " + request.status);
        init_sdfv(null);
    };
    request.open('GET', url + ((/\?/).test(url) ? "&" : "?") + (new Date()).getTime(), true);
    request.send();
}

function find_recursive(graph, query, results, case_sensitive) {
    for (const nodeid of graph.nodes()) {
        const node = graph.node(nodeid);
        let label = node.label();
        if (!case_sensitive)
            label = label.toLowerCase();
        if (label.indexOf(query) !== -1)
            results.push(node);
        // Enter states or nested SDFGs recursively
        if (node.data.graph)
            find_recursive(node.data.graph, query, results, case_sensitive);
    }
    for (const edgeid of graph.edges()) {
        const edge = graph.edge(edgeid);
        let label = edge.label();
        if (label !== undefined) {
            if (!case_sensitive)
                label = label.toLowerCase();
            if (label.indexOf(query) !== -1)
                results.push(edge);
        }
    }
}

function sidebar_set_title(title) {
    // Modify sidebar header
    document.getElementById("sidebar-header").innerText = title;
}

function sidebar_get_contents() {
    return document.getElementById("sidebar-contents");
}

function sidebar_show() {
    // Open sidebar if closed
    document.getElementById("sidebar").style.display = "flex";
}

function fill_info(elem) {
    // Change contents
    const contents = sidebar_get_contents();
    let html = "";
    if (elem instanceof Edge && elem.data.type === "Memlet") {
        const sdfg_edge = elem.sdfg.nodes[elem.parent_id].edges[elem.id];
        html += "<h4>Connectors: " + sdfg_edge.src_connector + " &rarr; " + sdfg_edge.dst_connector + "</h4>";
    }
    html += "<hr />";

    for (const attr of Object.entries(elem.attributes())) {
        if (attr[0] === "layout" || attr[0] === "sdfg" || attr[0] === "_arrays" || attr[0].startsWith("_meta_")) continue;
        html += "<b>" + attr[0] + "</b>:&nbsp;&nbsp;";
        html += sdfg_property_to_string(attr[1], renderer.view_settings()) + "</p>";
    }

    // If access node, add array information too
    if (elem instanceof AccessNode) {
        const sdfg_array = elem.sdfg.attributes._arrays[elem.attributes().data];
        html += "<br /><h4>" + sdfg_array.type + " properties:</h4>";
        for (const attr of Object.entries(sdfg_array.attributes)) {
            if (attr[0] === "layout" || attr[0] === "sdfg" || attr[0].startsWith("_meta_")) continue;
            html += "<b>" + attr[0] + "</b>:&nbsp;&nbsp;";
            html += sdfg_property_to_string(attr[1], renderer.view_settings()) + "</p>";
        }
    }

    contents.innerHTML = html;
}

function find_in_graph(renderer, sdfg, query, case_sensitive = false) {
    sidebar_set_title('Search Results for "' + query + '"');

    const results = [];
    if (!case_sensitive)
        query = query.toLowerCase();
    find_recursive(sdfg, query, results, case_sensitive);

    // Zoom to bounding box of all results first
    if (results.length > 0)
        renderer.zoom_to_view(results);

    // Show clickable results in sidebar
    const sidebar = sidebar_get_contents();
    sidebar.innerHTML = '';
    for (const result of results) {
        const d = document.createElement('div');
        d.className = 'context_menu_option';
        d.innerHTML = result.type() + ' ' + result.label();
        d.onclick = () => { renderer.zoom_to_view([result]) };
        d.onmouseenter = () => {
            if (!result.highlighted) {
                result.highlighted = true;
                renderer.draw_async();
            }
        };
        d.onmouseleave = () => {
            if (result.highlighted) {
                result.highlighted = false;
                renderer.draw_async();
            }
        };
        sidebar.appendChild(d);
    }

    sidebar_show();
}

function recursive_find_graph(graph, sdfg_id) {
    let found = undefined;
    graph.nodes().forEach(n_id => {
        const n = graph.node(n_id);
        if (n && n.sdfg.sdfg_list_id === sdfg_id) {
            found = graph;
            return found;
        } else if (n && n.data.graph) {
            found = recursive_find_graph(n.data.graph, sdfg_id);
            if (found)
                return found;
        }
    });
    return found;
}

function find_state(graph, state_id) {
    let state = undefined;
    graph.nodes().forEach(s_id => {
        if (Number(s_id) === state_id) {
            state = graph.node(s_id);
            return state;
        }
    });
    return state;
}

function find_node(state, node_id) {
    let node = undefined;
    state.data.graph.nodes().forEach(n_id => {
        if (Number(n_id) === node_id) {
            node = state.data.graph.node(n_id);
            return node;
        }
    });
    return node;
}

function find_edge(state, edge_id) {
    let edge = undefined;
    state.data.graph.edges().forEach(e_id => {
        if (Number(e_id.name) === edge_id) {
            edge = state.data.graph.edge(e_id);
            return edge;
        }
    });
    return edge;
}

function find_graph_element(graph, type, sdfg_id, state_id = -1, el_id = -1) {
    const requested_graph = recursive_find_graph(graph, sdfg_id);
    let state;
    if (requested_graph) {
        switch (type) {
            case 'edge':
                state = find_state(requested_graph, state_id);
                if (state)
                    return find_edge(state, el_id);
                break;
            case 'state':
                return find_state(requested_graph, state_id);
            case 'node':
                state = find_state(requested_graph, state_id);
                if (state)
                    return find_node(state, el_id);
                break;
            case 'isedge':
                let isedge = undefined;
                Object.values(requested_graph._edgeLabels).forEach(ise => {
                    if (ise.id === el_id) {
                        isedge = ise;
                        return isedge;
                    }
                });
                return isedge;
            default:
                return undefined;
        }
    }
    return undefined;
}

function outline(renderer, sdfg) {
    sidebar_set_title('SDFG Outline');

    const sidebar = sidebar_get_contents();
    sidebar.innerHTML = '';

    // Entire SDFG
    const d = document.createElement('div');
    d.className = 'context_menu_option';
    d.innerHTML = '<i class="material-icons" style="font-size: inherit">filter_center_focus</i> SDFG ' +
        renderer.sdfg.attributes.name;
    d.onclick = () => renderer.zoom_to_view();
    sidebar.appendChild(d);

    const stack = [sidebar];

    // Add elements to tree view in sidebar
    traverse_sdfg_scopes(sdfg, (node, parent) => {
        // Skip exit nodes when scopes are known
        if (node.type().endsWith('Exit') && node.data.node.scope_entry >= 0) {
            stack.push(null);
            return true;
        }

        // Create element
        const d = document.createElement('div');
        d.className = 'context_menu_option';
        let is_collapsed = node.attributes().is_collapsed;
        is_collapsed = (is_collapsed === undefined) ? false : is_collapsed;
        let node_type = node.type();

        // If a scope has children, remove the name "Entry" from the type
        if (node.type().endsWith('Entry')) {
            const state = node.sdfg.nodes[node.parent_id];
            if (state.scope_dict[node.id] !== undefined) {
                node_type = node_type.slice(0, -5);
            }
        }

        d.innerHTML = node_type + ' ' + node.label() + (is_collapsed ? " (collapsed)" : "");
        d.onclick = (e) => {
            // Show node or entire scope
            const nodes_to_display = [node];
            if (node.type().endsWith('Entry')) {
                const state = node.sdfg.nodes[node.parent_id];
                if (state.scope_dict[node.id] !== undefined) {
                    for (const subnode_id of state.scope_dict[node.id])
                        nodes_to_display.push(parent.node(subnode_id));
                }
            }

            renderer.zoom_to_view(nodes_to_display);

            // Ensure that the innermost div is the one that handles the event
            if (!e) e = window.event;
            e.cancelBubble = true;
            if (e.stopPropagation) e.stopPropagation();
        };
        stack.push(d);

        // If is collapsed, don't traverse further
        if (is_collapsed)
            return false;

    }, (node, parent) => {
        // After scope ends, pop ourselves as the current element 
        // and add to parent
        const elem = stack.pop();
        if (elem)
            stack[stack.length - 1].appendChild(elem);
    });

    sidebar_show();
}

function mouse_event(evtype, event, mousepos, elements, renderer,
    selected_elements, ends_drag) {
    if ((evtype === 'click' && !ends_drag) || evtype === 'dblclick') {
        if (renderer.menu)
            renderer.menu.destroy();
        let element;
        if (selected_elements.length === 0)
            element = new SDFG(renderer.sdfg);
        else if (selected_elements.length === 1)
            element = selected_elements[0];
        else
            element = null;

        if (element !== null) {
            sidebar_set_title(element.type() + " " + element.label());
            fill_info(element);
        } else {
            close_menu();
            sidebar_set_title("Multiple elements selected");
        }
        sidebar_show();

    }
}

function close_menu() {
    document.getElementById("sidebar").style.display = "none";
}


function init_menu() {
    const right = document.getElementById('sidebar');
    const bar = document.getElementById('dragbar');

    const drag = (e) => {
        document.selection ? document.selection.empty() : window.getSelection().removeAllRanges();
        right.style.width = Math.max(((e.view.innerWidth - e.pageX)), 20) + 'px';
    };

    bar.addEventListener('mousedown', () => {
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', () => {
            document.removeEventListener('mousemove', drag);
        });
    });
}

$('document').ready(() => {
    init_menu();
});
