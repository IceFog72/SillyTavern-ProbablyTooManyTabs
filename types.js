// types.js - PTMT (ProbablyTooManyTabs) Type Definitions
// Core type definitions for the SillyTavern PTMT extension
// @ts-check

/**
 * @typedef {Object} TabData
 * @property {string|null} panelId
 * @property {string|null} sourceId
 * @property {string|null} title
 * @property {string|null} icon
 * @property {boolean} collapsed
 * @property {boolean} active
 * @property {number} order
 * @property {boolean} isDefault
 * @property {string|null} customContent
 * @property {Object} customData
 */

/**
 * @typedef {Object} ViewSettings
 * @property {number} minimalPanelSize
 * @property {'auto'|'horizontal'|'vertical'} defaultOrientation
 * @property {'auto'|'horizontal'|'vertical'} collapsedOrientation
 * @property {'default'|'reversed'} contentFlow
 * @property {string|null} appliedOrientation
 * @property {string|null} lastExpandedOrientation
 */

/**
 * @typedef {Object} PaneNode
 * @property {'pane'} type
 * @property {string} paneId
 * @property {string|null} flex
 * @property {string|null} lastFlex
 * @property {string|null} minWidth
 * @property {string|null} minHeight
 * @property {string} actualWidth
 * @property {string} actualHeight
 * @property {ViewSettings} viewSettings
 * @property {TabData[]} tabs
 * @property {boolean} isCollapsed
 * @property {string|null} columnLocation
 */

/**
 * @typedef {Object} SplitNode
 * @property {'split'} type
 * @property {string|null} flex
 * @property {string|null} lastFlex
 * @property {'horizontal'|'vertical'} orientation
 * @property {'horizontal'|'vertical'} naturalOrientation
 * @property {string|null} orientationExpanded
 * @property {string|null} orientationCollapsed
 * @property {Array<PaneNode|SplitNode>} children
 * @property {number[]} splitRatios
 * @property {string} actualWidth
 * @property {string} actualHeight
 * @property {boolean} isCollapsed
 * @property {string|null} columnLocation
 */

/**
 * @typedef {Object} GhostTab
 * @property {string} searchId
 * @property {string} searchClass
 * @property {string} paneId
 * @property {string} [column]
 */

/**
 * @typedef {Object} ResizerState
 * @property {'vertical'|'horizontal'} type
 * @property {string} prevFlex
 * @property {string} nextFlex
 * @property {boolean} disabled
 */

/**
 * @typedef {Object} HiddenTab
 * @property {string} sourceId
 * @property {string} [title]
 * @property {string} [icon]
 */

/**
 * @typedef {Object} ColumnLayout
 * @property {string|null} flex
 * @property {PaneNode|SplitNode|null} content
 * @property {GhostTab[]} ghostTabs
 */

/**
 * @typedef {Object} ColumnSizes
 * @property {string} left
 * @property {string} center
 * @property {string} right
 * @property {boolean} leftCollapsed
 * @property {boolean} rightCollapsed
 * @property {string|null} leftLastFlex
 * @property {string|null} centerLastFlex
 * @property {string|null} rightLastFlex
 */

/**
 * @typedef {Object} PanelLocation
 * @property {'left'|'center'|'right'} column
 * @property {number} paneIndex
 */

/**
 * @typedef {Object} LayoutSnapshot
 * @property {number} version
 * @property {number} timestamp
 * @property {'mobile'|'desktop'} mode
 * @property {boolean} showLeft
 * @property {boolean} showRight
 * @property {ColumnSizes} columnSizes
 * @property {{left: ColumnLayout, center: ColumnLayout, right: ColumnLayout}} columns
 * @property {ResizerState[]} resizerStates
 * @property {HiddenTab[]} hiddenTabs
 * @property {Array<[string, PanelLocation]>} panelLocations
 */

/**
 * @typedef {Object} Preset
 * @property {string} id
 * @property {string} name
 * @property {LayoutSnapshot} layout
 */

/**
 * @typedef {Object} PanelMapping
 * @property {string} id
 * @property {string} title
 * @property {string} icon
 */

/**
 * @typedef {Object} PTMTSettings
 * @property {boolean} showLeftPane
 * @property {boolean} showRightPane
 * @property {boolean} showIconsOnly
 * @property {boolean} tabStripAutoHide
 * @property {number} maxLayersLeft
 * @property {number} maxLayersCenter
 * @property {number} maxLayersRight
 * @property {boolean} runMoveBgDivs
 * @property {boolean} moveBg1ToSheld
 * @property {boolean} isMobile
 * @property {boolean} hideContentWhileResizing
 * @property {boolean} showContextStatusBar
 * @property {boolean} enableOverride1
 * @property {boolean} optimizeMessageVisibility
 * @property {boolean} enableAutoContrast
 * @property {boolean} enableDialogueColorizer
 * @property {boolean} autoOpenFirstCenterTab
 * @property {boolean} enableAvatarExpressionSync
 * @property {'avatar_vibrant'|'static_color'} dialogueColorizerSource
 * @property {string} dialogueColorizerStaticColor
 * @property {'avatar_vibrant'|'static_color'} dialogueColorizerBubbleSource
 * @property {string} dialogueColorizerBubbleStaticColor1
 * @property {string} dialogueColorizerBubbleStaticColor2
 * @property {'avatar_vibrant'|'static_color'} dialogueColorizerPersonaSource
 * @property {string} dialogueColorizerPersonaStaticColor
 * @property {'avatar_vibrant'|'static_color'} dialogueColorizerPersonaBubbleSource
 * @property {string} dialogueColorizerPersonaBubbleStaticColor1
 * @property {string} dialogueColorizerPersonaBubbleStaticColor2
 * @property {1|2|3} dialogueColorizerColorizeTarget - Bitmask: 1=quoted text, 2=bubbles, 3=both
 * @property {number} dialogueColorizerBubbleOpacityBot - 0.0 to 1.0
 * @property {number} dialogueColorizerBubbleOpacityUser - 0.0 to 1.0
 * @property {1|2} dialogueColorizerDialogColorMode - 1=1st dominant, 2=2nd dominant
 * @property {1|2|3} dialogueColorizerBubbleColorMode - 1=1st dominant, 2=2nd dominant, 3=gradient
 * @property {string[]} charCustomColorizerEnabled - char names with custom colorizer enabled
 * @property {Object.<string, Object>} charCustomColorizerSettings - keyed by char name
 * @property {string[]} personaCustomColorizerEnabled - persona filenames with custom colorizer enabled
 * @property {Object.<string, Object>} personaCustomColorizerSettings - keyed by persona filename
 * @property {string} avatarBaseHeight - CSS value e.g. '14vh'
 * @property {string} avatarBaseWidth - CSS value e.g. '8vw'
 * @property {string} avatarBaseBorderRadius - CSS value e.g. '0.5rem'
 * @property {string} normalAvatarSize - CSS value e.g. '48px'
 * @property {string} avatarScaleWidth - multiplier string e.g. '1'
 * @property {string} avatarScaleHeight - multiplier string e.g. '1.6'
 * @property {string} charListAvatarWidth - CSS value e.g. '4vw'
 * @property {string} charListAvatarHeight - CSS value e.g. 'auto'
 * @property {string} charListAvatarScale - multiplier string e.g. '1'
 * @property {string} bodyBgColor - CSS rgb() value
 * @property {string|null} lastSeenVersion - last version user acknowledged; null = first install
 * @property {string} uiTheme - theme key e.g. 'sharp' | 'rounded_smooth'
 * @property {PanelMapping[]} panelMappings
 * @property {Preset[]} presets
 * @property {LayoutSnapshot|null} savedLayoutDesktop
 * @property {LayoutSnapshot|null} savedLayoutMobile
 * @property {LayoutSnapshot} defaultLayout
 * @property {LayoutSnapshot} mobileLayout
 */


/**
 * @typedef {Object} PTMTRefs
 * @property {HTMLElement|null} main
 * @property {HTMLElement|null} mainBody
 * @property {HTMLElement|null} leftBody
 * @property {HTMLElement|null} centerBody
 * @property {HTMLElement|null} rightBody
 * @property {HTMLElement|null} dropIndicator
 * @property {HTMLElement|null} splitOverlay
 */

/**
 * @typedef {Object} DragContext
 * @property {string} pid
 * @property {Element|null} elUnder
 * @property {HTMLElement} paneUnder
 * @property {boolean} overTabStrip
 * @property {boolean} wantsCopy
 * @property {number} clientX
 * @property {number} clientY
 */

/**
 * @typedef {Object} PTMTAPI
 * @property {Function} createTabFromContent
 * @property {Function} moveNodeIntoTab
 * @property {Function} listTabs
 * @property {Function} openTab
 * @property {Function} closeTabById
 * @property {Function} getPanelById
 * @property {Function} getTabById
 * @property {Function} setDefaultPanelById
 * @property {Function} moveTabIntoPaneAtIndex
 * @property {Function} openViewSettingsDialog
 * @property {Function} readPaneViewSettings
 * @property {Function} writePaneViewSettings
 * @property {Function} setActivePanelInPane
 * @property {Function} setTabCollapsed
 * @property {Function} applyPaneOrientation
 * @property {Function} attachResizer
 * @property {Function} setSplitOrientation
 * @property {Function} updateSplitCollapsedState
 * @property {Function} applySplitOrientation
 * @property {Function} generateLayoutSnapshot
 * @property {Function} destroyTabById
 * @property {Function} updatePendingTabColumn
 * @property {Function} checkPaneForIconMode
 * @property {Function} saveLayout
 * @property {Function} loadLayout
 * @property {Function} resetLayout
 * @property {Function} savePreset
 * @property {Function} loadPreset
 * @property {Function} deletePreset
 * @property {Function} switchToMobileLayout
 * @property {Function} switchToDesktopLayout
 * @property {Function} toggleMobileMode
 * @property {Function} _refs
 */

/**
 * @typedef {'onInit'|'onSelect'|'onCollapse'|'onOpen'} TabActionType
 */

export {};
