/**
 * Implements a parrilizable DFS check for graph connictivity given a set of nodes
 * and a root node. Stating for the set of node to check this does a DFS and
 * will return a set a nodes if any that is not connected to the root node.
 * @param {object} graph - an instance of ipld-graph-builder
 * @param {object} state - the state containing all of the containers to search
 * @param {string} root - the root id
 * @param {Set} nodes - a set of nodes to start searching from
 */
module.exports = async function DFSchecker (tree, root, nodes) {
  const checkedNodesSet = new Set()
  let hasRootSet = new Set()
  const promises = []

  for (const id of nodes) {
    // create a set for each of the starting nodes to track the nodes the DFS has
    // has traversed
    const checkedNodes = new Set()
    checkedNodesSet.add(checkedNodes)
    promises.push(check(id, checkedNodes))
  }

  // wait for all the search to complete
  await Promise.all(promises)
  // remove the set of nodes that are connected to the root
  checkedNodesSet.delete(hasRootSet)
  let unLinkedNodesArray = []

  // combine the unconnected sets into a single array
  for (const set of checkedNodesSet) {
    unLinkedNodesArray = unLinkedNodesArray.concat([...set])
  }
  return unLinkedNodesArray

  // does the DFS starting with a single node ID
  async function check (id, checkedNodes) {
    if (!checkedNodesSet.has(checkedNodes) || // check if this DFS is still searching
        checkedNodes.has(id) ||  // check if this DFS has alread seen the node
        hasRootSet === checkedNodes) { // check that this DFS has alread found the root node
      return
    }

    // check if any of the the other DFSs have seen this node and if so merge
    // the sets and stop searching
    for (const set of checkedNodesSet) {
      if (set.has(id)) {
        checkedNodes.forEach(id => set.add(id))
        checkedNodesSet.delete(checkedNodes)
        return
      }
    }

    // mark the node 'checked'
    checkedNodes.add(id)

    // check to see if we are at the root
    if (id === root) {
      hasRootSet = checkedNodes
      return
    }

    const node = await tree.get(id)
    const promises = []
    // iterate through the nodes ports and recursivly check them
    for (const name in node.ports) {
      const port = node.ports[name]
      promises.push(check(port.destId, checkedNodes))
    }
    return Promise.all(promises)
  }
}
