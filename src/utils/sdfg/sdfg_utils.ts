// Copyright 2019-2021 ETH Zurich and the DaCe authors. All rights reserved.

import {
    Edge,
    SDFGElement,
    SDFGNode,
    NestedSDFG,
    State,
} from '../../renderer/renderer_elements';
import {
    DagreSDFG,
    JsonSDFGEdge,
    JsonSDFGNode,
    JsonSDFGState,
} from '../../index';

export function recursively_find_graph(
    graph: DagreSDFG,
    graph_id: number,
    ns_node: SDFGNode | undefined = undefined
): { graph: DagreSDFG | undefined, node: SDFGNode | undefined } {
    if (graph.node('0').sdfg.sdfg_list_id === graph_id) {
        return {
            graph: graph,
            node: ns_node,
        };
    } else {
        const result = {
            graph: undefined,
            node: undefined,
        };
        for (const state_id of graph.nodes()) {
            const state = graph.node(state_id);
            if (state.data.graph !== undefined && state.data.graph !== null)
                for (const node_id of state.data.graph.nodes()) {
                    const node = state.data.graph.node(node_id);
                    if (node instanceof NestedSDFG) {
                        const search_graph = recursively_find_graph(
                            node.data.graph, graph_id, node
                        );
                        if (search_graph.graph !== undefined) {
                            return search_graph;
                        }
                    }
                }
        }
        return result;
    }
}


export function find_exit_for_entry(
    nodes: JsonSDFGNode[], entry_node: JsonSDFGNode
): JsonSDFGNode | null {
    for (const n of nodes) {
        if (n.type.endsWith('Exit') && n.scope_entry &&
            parseInt(n.scope_entry) == entry_node.id)
            return n;
    }
    console.warn('Did not find corresponding exit');
    return null;
}


/**
 * Return the string UUID for an SDFG graph element.
 *
 * UUIDs have the form of "G/S/N/E", where:
 * G = Graph list id
 * S = State ID (-1 for (nested) SDFGs)
 * N = SDFGNode ID (-1 for States, SDFGs, and Edges)
 * E = Edge ID (-1 for States, SDFGs, and Nodes)
 *
 * @param {*} element   Element to generate the UUID for.
 *
 * @returns             String containing the UUID
 */
 export function get_uuid_graph_element(element: SDFGElement | null): string {
    const undefined_val = -1;
    if (element instanceof State) {
        return (
            element.sdfg.sdfg_list_id + '/' +
            element.id + '/' +
            undefined_val + '/' +
            undefined_val
        );
    } else if (element instanceof SDFGNode) {
        return (
            element.sdfg.sdfg_list_id + '/' +
            element.parent_id + '/' +
            element.id + '/' +
            undefined_val
        );
    } else if (element instanceof Edge) {
        let parent_id = undefined_val;
        if (element.parent_id !== null && element.parent_id !== undefined)
            parent_id = element.parent_id;
        return (
            element.sdfg.sdfg_list_id + '/' +
            parent_id + '/' +
            undefined_val + '/' +
            element.id
        );
    }
    return (
        undefined_val + '/' +
        undefined_val + '/' +
        undefined_val + '/' +
        undefined_val
    );
}


export function check_and_redirect_edge(
    edge: JsonSDFGEdge, drawn_nodes: Set<string>, sdfg_state: JsonSDFGState
): JsonSDFGEdge | null {
    // If destination is not drawn, no need to draw the edge
    if (!drawn_nodes.has(edge.dst))
        return null;
    // If both source and destination are in the graph, draw edge as-is
    if (drawn_nodes.has(edge.src))
        return edge;

    // If immediate scope parent node is in the graph, redirect
    const scope_src = sdfg_state.nodes[parseInt(edge.src)].scope_entry;
    if (!scope_src || !drawn_nodes.has(scope_src))
        return null;

    // Clone edge for redirection, change source to parent
    const new_edge = Object.assign({}, edge);
    new_edge.src = scope_src;

    return new_edge;
}

export function find_graph_element_by_uuid(
    p_graph: DagreSDFG | undefined | null, uuid: string
): { parent: DagreSDFG | undefined, element: any } {
    const uuid_split = uuid.split('/');
    
    const graph_id = Number(uuid_split[0]);
    const state_id = Number(uuid_split[1]);
    const node_id = Number(uuid_split[2]);
    const edge_id: any = Number(uuid_split[3]);
    
    let result: {
        parent: DagreSDFG | undefined,
        element: any,
    } = {
        parent: undefined,
        element: undefined,
    };

    if (!p_graph)
        return result;
    
    let graph = p_graph;
    if (graph_id > 0) {
        const found_graph = recursively_find_graph(graph, graph_id);
        if (found_graph.graph === undefined)
            throw new Error();

        graph = found_graph.graph;
        result = {
            parent: graph,
            element: found_graph.node,
        };
    }
    
    let state = undefined;
    if (state_id !== -1 && graph !== undefined) {
        state = graph.node(state_id.toString());
        result = {
            parent: graph,
            element: state,
        };
    }
    
    if (node_id !== -1 && state !== undefined && state.data.graph !== null) {
        // Look for a node in a state.
        result = {
            parent: state.data.graph,
            element: state.data.graph.node(node_id),
        };
    } else if (
        edge_id !== -1 && state !== undefined &&
        state.data.graph !== null
    ) {
        // Look for an edge in a state.
        result = {
            parent: state.data.graph,
            element: state.data.graph.edge(edge_id),
        };
    } else if (edge_id !== -1 && state === undefined) {
        // Look for an inter-state edge.
        result = {
            parent: graph,
            element: graph.edge(edge_id),
        };
    }
    
    return result;
}

/**
 * Initializes positioning information on the given element.
 *
 * @param {SDFGElement} elem    The element to be initialized
 * @returns                     Initially created positioning information
 */
export function initialize_positioning_info(elem: any): any {
    let position;
    if (elem instanceof Edge || elem.type === 'MultiConnectorEdge') {
        let points = undefined;
        if (elem.points)
            points = Array(elem.points.length);

        position = {
            points: points ? points : [],
            scope_dx: 0,
            scope_dy: 0
        };

        for (let i = 0; elem.points && i < elem.points.length; i++)
            position.points[i] = { dx: 0, dy: 0 };
    } else {
        position = { dx: 0, dy: 0, scope_dx: 0, scope_dy: 0 };
    }

    set_positioning_info(elem, position);

    return position;
}

/**
 * Sets the positioning information on a given element. Replaces old
 * positioning information.
 * 
 * @param {SDFGElement} elem    The element that receives new positioning info
 * @param {*} position          The positioning information
 */
export function set_positioning_info(
    elem: any, position: any
): void {
    if (elem instanceof State)
        elem.data.state.attributes.position = position;
    else if (elem instanceof SDFGNode)
        elem.data.node.attributes.position = position;
    else if (elem instanceof Edge)
        elem.data.attributes.position = position;
    else if (elem.type === 'MultiConnectorEdge')
        elem.attributes.data.attributes.position = position;
    // Works also for other objects with attributes
    else if (elem.attributes)
        elem.attributes.position = position;
}

/**
 * Finds the positioning information of the given element
 *
 * @param {SDFGElement} elem    The element that contains the information
 * @returns                     Position information, undefined if not present
 */
export function get_positioning_info(elem: any): any {
    if (elem instanceof State)
        return elem.data.state.attributes.position;
    if (elem instanceof SDFGNode)
        return elem.data.node.attributes.position;
    if (elem instanceof Edge)
        return elem.data.attributes.position;
    if (elem?.type === 'MultiConnectorEdge')
        return elem?.attributes?.data?.attributes?.position;
    // Works also for other objects with attributes
    if (elem?.attributes)
        return elem.attributes.position;

    return undefined;
}

/**
 * Deletes the positioning information of the given element
 *
 * @param {SDFGElement} elem    The element that contains the information
 */
export function delete_positioning_info(elem: any): void {
    if (elem instanceof State)
        delete elem.data.state.attributes.position;
    if (elem instanceof SDFGNode)
        delete elem.data.node.attributes.position;
    if (elem instanceof Edge)
        delete elem.data.attributes.position;
    if (elem?.type === 'MultiConnectorEdge')
        delete elem.attributes.data.attributes.position;
    // Works also for other objects with attributes
    if (elem?.attributes)
        delete elem.attributes.position;
}