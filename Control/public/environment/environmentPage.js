import {h} from '/js/src/index.js';
import pageLoading from '../common/pageLoading.js';
import pageError from '../common/pageError.js';
import showTableList from '../common/showTableList.js';
/**
 * @file Page to show 1 environment (content and header)
 */

/**
 * Header of page showing one environment
 * Only page title with no action
 * @param {Object} model
 * @return {vnode}
 */
export const header = (model) => [
  h('.w-50 text-center', [
    h('h4', 'Environment details')
  ]),
  h('.flex-grow text-right', [

  ])
];

/**
 * Content page showing one environment
 * @param {Object} model
 * @return {vnode}
 */
export const content = (model) => h('.scroll-y.absolute-fill', [
  model.environment.item.match({
    NotAsked: () => null,
    Loading: () => pageLoading(),
    Success: (data) => showContent(model, data.environment),
    Failure: (error) => pageError(error),
  })
]);

/**
 * Show all properties of environment and buttons for its actions at bottom
 * @param {Object} model
 * @param {Environment} item - environment to show on this page
 * @return {vnode}
 */
const showContent = (model, item) => [
  showControl(model.environment, item),
  item.state === 'RUNNING' && model.environment.plots.match({
    NotAsked: () => null,
    Loading: () => null,
    Success: (data) => showEmbeddedGraphs(data),
    Failure: () => null,
  }),
  showEnvDetailsTable(item),
  h('.m2', h('h4', 'Tasks')),
  showTableList(item.tasks),
];

/**
 * Method to display pltos from Graphana
 * @param {Array<String>} data
 * @return {vnode}
 */
const showEmbeddedGraphs = (data) =>
  h('.m2',
    h('h4', 'Details'),
    h('.flex-row',
      {
        style: 'height: 15em;'
      },
      [
        h('.w-33.flex-row', [
          h('.w-50',
            h('iframe',
              {
                src: data[0],
                style: 'width: 100%; height: 100%; border: 0'
              }
            )),
          h('.w-50',
            h('iframe',
              {
                src: data[1],
                style: 'width: 100%; height: 100%; border: 0'
              }
            ))
        ]),
        // Large Plot
        h('.flex-grow',
          h('iframe',
            {
              src: data[2],
              style: 'width: 100%; height: 100%; border: 0'
            }
          )
        )])
  );

/**
 * Table to display Environment details
 * @param {Object} item - object to be shown
 * @return {vnode} table view
 */
const showEnvDetailsTable = (item) =>
  h('.pv3',
    h('table.table', [
      h('tbody', [
        item.currentRunNumber && h('tr', [
          h('th', 'Current Run Number'),
          h('td',
            {
              class: 'badge bg-success white'
            },
            item.currentRunNumber
          )
        ]),
        h('tr', [
          h('th', 'Number of Tasks'),
          h('td', item.tasks.length)
        ]),
        h('tr', [
          h('th', 'ID'),
          h('td', item.id)
        ]),
        h('tr', [
          h('th', 'Created'),
          h('td', new Date(item.createdWhen).toLocaleString())
        ]),
        h('tr', [
          h('th', 'State'),
          h('td',
            {
              class: item.state === 'RUNNING' ? 'success' : (item.state === 'CONFIGURED' ? 'warning' : ''),
              style: 'font-weight: bold;'
            },
            item.state)
        ]),
        h('tr', [
          h('th', 'Root Role'),
          h('td', item.rootRole)
        ])
      ])
    ]
    )
  );

/**
 * List of buttons, each one is an action to do on the current environment `item`
 * @param {Object} environment
 * @param {Environment} item - environment to show on this page
 * @return {vnode}
 */
const showControl = (environment, item) => h('.mv2.pv3.ph2', [
  h('div.flex-row',
    h('div.flex-grow',
      [
        controlButton('.btn-success', environment, item, 'START', 'START_ACTIVITY', 'CONFIGURED'), ' ',
        controlButton('.btn-danger', environment, item, 'STOP', 'STOP_ACTIVITY', 'RUNNING'), ' ',
        controlButton('.btn-warning', environment, item, 'CONFIGURE', 'CONFIGURE', 'STANDBY'), ' ',
        controlButton('', environment, item, 'RESET', 'RESET', 'CONFIGURED'), ' '
      ]
    )
  ),
  environment.itemControl.match({
    NotAsked: () => null,
    Loading: () => null,
    Success: (_data) => null,
    Failure: (error) => h('p.danger', error),
  })
]);

/**
 * Makes a button to toggle severity
 * @param {string} buttonType
 * @param {Object} environment
 * @param {Object} item
 * @param {string} label - button's label
 * @param {string} type - action
 * @param {string} stateToHide - state in which button should not be displayed
 * @return {vnode}
 */
const controlButton = (buttonType, environment, item, label, type, stateToHide) =>
  h(`button.btn${buttonType}`,
    {
      class: environment.itemControl.isLoading() ? 'loading' : '',
      disabled: environment.itemControl.isLoading(),
      style: item.state !== stateToHide ? 'display: none;' : '',
      onclick: () => {
        environment.controlEnvironment({id: item.id, type: type});
      },
      title: item.state !== stateToHide ? `'${label}' cannot be used in state '${item.state}'` : label
    },
    label
  );
