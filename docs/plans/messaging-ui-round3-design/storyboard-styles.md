# Storyboard Style Class catalog — messaging-styled (116 classes)

Source: html-builder `projects/messaging-styled/styles/`, revision 6f585a74, distilled 2026-07-19.
Classes are IMMUTABLE in the source system. Here they are reference only: mirror the values into
messages-tab tokens / typed StyleBlocks — do not import the JSON, do not copy pixel values blindly
where the app already has an equivalent token (app tokens win; this catalog is the tie-breaker for
anything the app's tokens.css does not cover).

Reference images:
- `storyboard-scene-01.png` — room lane + Summary right panel (note: room has NO identity header — M4 adds one)
- `storyboard-scene-02.png` — DM lane + Tasks right panel (identity header present: name, role, status)
- `storyboard-scene-03.png` — DM lane + Stats right panel
- `storyboard-full.png` — all three scenes stacked

## AgentWorkingLabel-Style
Amber 9px agent-working status text

```css
color: #d7a842;
font-size: 9px;
```

## AppFrame-Style
Scaled application frame: border, shadow, two-row grid

```css
background: #101012;
border: 1px solid #2a2a2e;
border-radius: 12px;
box-shadow: 0 24px 80px rgba(0,0,0,0.34);
display: grid;
font-size: 12px;
grid-template-rows: 44px minmax(630px, 1fr);
grid-template-rows: 44px minmax(570px, 1fr);
overflow: hidden;
scale: 1.0344;
transform-origin: 0% 0%;
width: 100%;
```

## AppFrameWide-Style
Widened application frame: fixed 1400px centered frame (replaces the fluid 100% width and 1.0344 scale) so the centered conversation column shows obvious side spacing

```css
background: #101012;
border: 1px solid #2a2a2e;
border-radius: 12px;
box-shadow: 0 24px 80px rgba(0,0,0,0.34);
display: grid;
font-size: 12px;
grid-template-rows: 44px minmax(570px, 1fr);
margin-left: auto;
margin-right: auto;
max-width: 100%;
overflow: hidden;
width: 1400px;
```

## ArtefactLink-Style
Artefact link row, brighter tone, bullet column

```css
align-items: center;
color: #d3d0cb;
display: grid;
font-size: 10px;
gap: 8px;
grid-template-columns: 6px 1fr;
text-decoration: none;
```

## AvatarChip-Style
31px rounded avatar chip with initial

```css
align-items: center;
background: #29282d;
border-radius: 8px;
color: #dedce1;
display: flex;
font-size: 11px;
font-weight: 600;
height: 31px;
justify-content: center;
width: 31px;
```

## BadgeCount-Style
18px amber circular unread-count badge

```css
align-items: center;
background: #e4ae40;
border-radius: 999px;
color: #17130b;
display: flex;
font-size: 9px;
font-weight: 600;
grid-column: 3;
height: 18px;
justify-content: center;
width: 18px;
```

## BaselineRow-Style
Baseline-aligned flex row with 8px gap (name + role)

```css
align-items: baseline;
display: flex;
gap: 8px;
```

## BodyColumn-Style
Message body column, vertical 5px gap, shrinkable

```css
display: flex;
flex-direction: column;
gap: 5px;
min-width: 0;
```

## BrandGlyph-Style
Amber monospace brand glyph

```css
color: #d7a842;
font-family: ui-monospace, monospace;
```

## BrandLockup-Style
Topbar brand lockup row (glyph plus wordmark)

```css
align-items: center;
align-self: center;
display: flex;
font-size: 11px;
font-weight: 600;
gap: 9px;
white-space: nowrap;
```

## CenteredColumn-Style
Center a content column inside its container: full width up to a 720px cap with auto side margins, so the conversation reads as a centered column with clear side spacing

```css
margin-left: auto;
margin-right: auto;
max-width: 720px;
width: 100%;
```

## ChannelIcon-Style
10px outlined channel/team icon box

```css
border: 1px solid currentColor;
border-radius: 2px;
box-sizing: border-box;
display: block;
height: 10px;
position: relative;
width: 10px;
```

## ChannelLabel-Style
Composer channel/addressee label, muted 10px

```css
color: #77767d;
font-size: 10px;
```

## ChecklistDotDone-Style
9px filled green checklist status dot

```css
background: #668574;
border-radius: 999px;
height: 9px;
width: 9px;
```

## ChecklistDotPending-Style
9px hollow ring checklist status dot

```css
border: 1px solid #77767d;
border-radius: 999px;
height: 9px;
width: 9px;
```

## ChecklistLabelBright-Style
Checklist item label, brighter 10px (pending tone)

```css
color: #d4d1cc;
font-size: 10px;
line-height: 1.3;
```

## ChecklistLabelMuted-Style
Checklist item label, dimmer 10px (completed tone)

```css
color: #716f76;
font-size: 10px;
line-height: 1.3;
```

## ChecklistRow-Style
Checklist row grid: 10px status column plus label

```css
align-items: center;
display: grid;
gap: 8px;
grid-template-columns: 10px 1fr;
```

## ComposerBox-Style
Composer card: bordered, rounded, 10px vertical gap

```css
background: #171719;
border: 1px solid #343438;
border-radius: 9px;
display: flex;
flex-direction: column;
gap: 10px;
min-height: 92px;
padding: 12px 14px;
```

## ComposerFooter-Style
Composer footer row pinned to bottom (draft state plus send)

```css
align-items: center;
display: flex;
justify-content: space-between;
margin-top: auto;
```

## ComposerForm-Style
Composer form wrapper, horizontal and bottom padding

```css
padding: 0 20px 18px;
```

## ComposerHint-Style
Composer placeholder text, dim 13px

```css
color: #67666d;
font-size: 13px;
margin: 0;
```

## ContextNameLabel-Style
Context panel person name, 13px semibold

```css
color: #f1efec;
font-size: 13px;
font-weight: 600;
```

## ContextPanel-Style
Right context panel: left border, vertical flex

```css
background: #121214;
border-left: 1px solid #2a2a2e;
display: flex;
flex-direction: column;
gap: 0;
overflow: hidden;
padding: 0;
position: relative;
```

## ContextPersonHeader-Style
Context panel person header row (name, role, working badge)

```css
align-items: center;
display: flex;
gap: 8px;
```

## ContextRoleLabel-Style
Context panel person role, muted 12px

```css
color: #8c8992;
font-size: 12px;
```

## ContextTab-Style
Inactive context-panel tab button (10px, 0 9px padding, flex)

```css
align-items: center;
background: transparent;
border: 0;
color: #8c8b91;
display: flex;
font-size: 10px;
height: 44px;
padding: 0 9px;
```

## ContextTabActive-Style
Active context-panel tab with bottom border (0 9px padding)

```css
align-items: center;
background: transparent;
border: 0;
border-bottom: 2px solid #f4f1ea;
color: #f4f1ea;
display: flex;
font-size: 10px;
font-weight: 500;
height: 44px;
margin-bottom: -1px;
padding: 0 9px;
```

## ContextTabActiveFlat-Style
Active context-panel tab variant with explicit zero radius

```css
align-items: center;
background: transparent;
border: 0;
border-bottom: 2px solid #f4f1ea;
border-radius: 0;
color: #f4f1ea;
display: flex;
font-size: 10px;
font-weight: 500;
height: 44px;
margin-bottom: -1px;
padding: 0 9px;
```

## ContextTabBar-Style
Context panel tab bar: 44px, space-between, bottom border

```css
align-items: center;
border-bottom: 1px solid #2a2a2e;
display: flex;
flex-shrink: 0;
height: 44px;
justify-content: space-between;
padding: 0 8px;
```

## ContextTabFlat-Style
Inactive context-panel tab variant with explicit zero radius

```css
align-items: center;
background: transparent;
border: 0;
border-radius: 0;
color: #8c8b91;
display: flex;
font-size: 10px;
height: 44px;
padding: 0 9px;
```

## ContextTabRow-Style
Context panel tab row container, stretched, 2px gap

```css
align-items: stretch;
display: flex;
gap: 2px;
height: 44px;
```

## DelegationCard-Style
Delegation/reply card: 24px icon column, body, action

```css
align-items: center;
background: #121214;
border-radius: 8px;
display: grid;
gap: 10px;
grid-template-columns: 24px minmax(0,1fr) auto;
padding: 10px 12px;
```

## DelegationMeta-Style
Delegation meta line, dim 9px

```css
color: #77767d;
font-size: 9px;
```

## DelegationStack-Style
Delegation card body stack, 3px gap, shrinkable

```css
display: flex;
flex-direction: column;
gap: 3px;
min-width: 0;
```

## DelegationTitle-Style
Delegation card title, 10px semibold

```css
color: #d7d3cc;
font-size: 10px;
font-weight: 600;
```

## DraftSavedLabel-Style
Composer draft-saved status text, dim 10px

```css
color: #67666d;
font-size: 10px;
```

## EyebrowLabel-Style
Amber uppercase eyebrow label with wide tracking

```css
color: #d7a842;
font-size: 11px;
letter-spacing: 0.14em;
text-transform: uppercase;
```

## FolderIcon-Style
15px outlined folder icon box

```css
border: 1.5px solid currentColor;
border-radius: 3px;
box-sizing: border-box;
display: block;
height: 15px;
position: relative;
width: 15px;
```

## FolderIconEdge-Style
Folder glyph left edge line (absolute border-left)

```css
border-left: 1px solid currentColor;
bottom: 0;
left: 3px;
position: absolute;
top: 0;
```

## FolderIconFlap-Style
Folder glyph top flap line (absolute border-top)

```css
border-top: 1px solid currentColor;
left: 0;
position: absolute;
right: 6px;
top: 3px;
```

## FrameRailLeft-Style
Hero frame left vertical rail line

```css
border-left: 1.5px solid currentColor;
bottom: 0;
left: 5px;
position: absolute;
top: 0;
```

## FrameRailRight-Style
Hero frame right vertical rail line

```css
border-right: 1.5px solid currentColor;
bottom: 0;
position: absolute;
right: 5px;
top: 0;
```

## HeroColumn-Style
Scaled hero content column, 8px gap, max width 760px

```css
display: flex;
flex-direction: column;
font-size: 12px;
gap: 8px;
max-width: 760px;
scale: 1.0344;
transform-origin: 0% 0%;
```

## HeroHeading-Style
Hero heading, 28px tight tracking

```css
font-size: 28px;
font-weight: 600;
letter-spacing: -0.035em;
line-height: 1.12;
margin: 0;
```

## HeroSection-Style
Hero section: app background, Inter stack, padded column

```css
background: #0b0b0d;
box-sizing: border-box;
color: #f4f1ea;
column-gap: 14.2882px;
display: flex;
flex-direction: column;
font-family: Inter, ui-sans-serif, system-ui, sans-serif;
font-size: 12.4122px;
gap: 14px;
min-height: 0px;
min-width: 0px;
overflow: visible;
padding: 16px;
padding-bottom: 16.5497px;
padding-left: 16.5497px;
padding-right: 16.5497px;
padding-top: 16.5497px;
row-gap: 14.4809px;
width: 100%;
```

## HeroSubcopy-Style
Hero subcopy paragraph, muted 12px relaxed line

```css
color: #9a989f;
font-size: 12px;
line-height: 1.55;
margin: 0;
```

## IconButton-Style
26px square ghost icon button

```css
align-items: center;
background: transparent;
border: 0;
border-radius: 5px;
color: #8f8d95;
display: flex;
height: 26px;
justify-content: center;
padding: 0;
width: 26px;
```

## IconSquare-Style
34px rounded icon square with centered glyph

```css
background: #2a292d;
border-radius: 8px;
display: grid;
font-size: 10px;
height: 34px;
place-items: center;
width: 34px;
```

## LinkBullet-Style
4px round link list bullet

```css
background: #77767d;
border-radius: 999px;
height: 4px;
width: 4px;
```

## MainPanel-Style
Main panel: feed row plus composer row grid

```css
background: #0f0f11;
display: grid;
grid-template-rows: minmax(0, 1fr) auto;
min-width: 0;
```

## MessageBody-Style
Message body text, 10px with 1.45 line height

```css
color: #d7d3cc;
font-size: 10px;
line-height: 1.45;
margin: 0;
```

## MessageFeed-Style
Message feed scroll column, 14px gap, padded

```css
display: flex;
flex-direction: column;
gap: 14px;
overflow: hidden;
overflow-y: auto;
padding: 18px 16px;
```

## MessageRow-Style
Message row grid: avatar, body column, timestamp

```css
align-items: start;
display: grid;
gap: 12px;
grid-template-columns: 34px minmax(0,1fr) auto;
width: 100%;
```

## MessageStack-Style
Message group stack, vertical 4px gap, shrinkable

```css
display: flex;
flex-direction: column;
gap: 4px;
min-width: 0;
```

## NameLabel-Style
Rail person name, 10px semibold tight line

```css
color: #f1efec;
font-size: 10px;
font-weight: 600;
line-height: 1.15;
```

## NameRoleStack-Style
Tight vertical stack for name over role

```css
display: flex;
flex-direction: column;
gap: 1px;
min-width: 0;
```

## NotificationBody-Style
Notification/current item body text, 10px with 1.4 line height

```css
color: #d4d1cc;
font-size: 10px;
line-height: 1.4;
margin: 0;
```

## NotificationDot-Style
4px gray notification marker dot, 5px top offset

```css
background: #77767d;
border-radius: 999px;
height: 4px;
margin-top: 5px;
width: 4px;
```

## NotificationDotAmber-Style
5px amber notification marker dot, 5px top offset

```css
background: #d7a842;
border-radius: 999px;
height: 5px;
margin-top: 5px;
width: 5px;
```

## NotificationHeader-Style
Notification header row: title left, action right

```css
align-items: center;
display: flex;
gap: 10px;
justify-content: space-between;
```

## NotificationMarker-Style
5px amber square notification marker

```css
background: #d7a842;
border-radius: 1px;
height: 5px;
width: 5px;
```

## NotificationRow-Style
Notification/current row grid: 6px marker plus body

```css
align-items: start;
display: grid;
gap: 8px;
grid-template-columns: 6px 1fr;
```

## NotificationTitle-Style
Notification title text, 10px light tone

```css
color: #d4d1cc;
font-size: 10px;
```

## PanelList-Style
Panel list stack, vertical 7px gap

```css
display: flex;
flex-direction: column;
gap: 7px;
```

## PanelStack-Style
Right-rail panel stack, vertical 8px gap

```css
display: flex;
flex-direction: column;
gap: 8px;
```

## Pill-Style
Rounded pill label (feed day divider)

```css
align-self: center;
background: #1b1b1e;
border-radius: 999px;
color: #67666d;
font-size: 9px;
letter-spacing: 0.1em;
padding: 4px 8px;
```

## PrimaryButton-Style
Amber solid primary action button

```css
background: #d7a842;
border: 0;
border-radius: 6px;
color: #17130b;
font-size: 10px;
font-weight: 600;
padding: 6px 10px;
```

## RailBody-Style
Panel scroll body: vertical 20px gap, padded, overflow-y auto

```css
display: flex;
flex: 1 1 auto;
flex-direction: column;
gap: 20px;
min-height: 0;
overflow-y: auto;
padding: 14px 14px 18px;
```

## RailHeaderBar-Style
Rail header bar with negative horizontal margin

```css
align-items: center;
border-bottom: 1px solid #2a2a2e;
display: flex;
flex-shrink: 0;
height: 44px;
justify-content: space-between;
margin: 0 -10px;
padding: 0 8px;
```

## RailInner-Style
Left rail inner column: full height, padded, relative

```css
box-sizing: border-box;
display: flex;
flex-direction: column;
height: 100%;
min-height: 0;
padding: 0 10px 12px;
position: relative;
white-space: nowrap;
```

## RailLink-Style
Rail link row: 6px bullet column plus label, no underline

```css
align-items: center;
color: #aaa7ad;
display: grid;
font-size: 10px;
gap: 8px;
grid-template-columns: 6px 1fr;
text-decoration: none;
```

## RailListStack-Style
Left-rail item list stack, vertical 2px gap

```css
display: flex;
flex-direction: column;
gap: 2px;
```

## RailPanel-Style
Left rail panel: right border, vertical flex

```css
background: #121214;
border-right: 1px solid #2a2a2e;
display: flex;
flex-direction: column;
gap: 0;
overflow: hidden;
padding: 0;
position: relative;
```

## RailPersonItem-Style
Left-rail person row button: avatar, name/role, presence

```css
align-items: center;
background: transparent;
border: 0;
border-radius: 8px;
color: #f1efec;
display: grid;
gap: 8px;
grid-template-columns: 31px minmax(0,1fr) 8px;
min-height: 39px;
padding: 4px 7px;
text-align: left;
```

## RailPersonItemActive-Style
Active left-rail person row button with dark fill

```css
align-items: center;
background: #232225;
border: 0;
border-radius: 8px;
color: #f1efec;
display: grid;
gap: 8px;
grid-template-columns: 31px minmax(0,1fr) 8px;
min-height: 39px;
padding: 4px 7px;
text-align: left;
```

## RailRoleLabel-Style
Rail person role, muted 8px

```css
color: #8c8992;
font-size: 8px;
line-height: 1.2;
```

## RailRoomItem-Style
Left-rail room row button without badge

```css
align-items: center;
background: transparent;
border: 0;
border-radius: 8px;
color: #929097;
display: grid;
font-size: 10px;
gap: 7px;
grid-template-columns: 13px minmax(0,1fr);
min-height: 27px;
padding: 4px 7px;
text-align: left;
```

## RailRoomItemActive-Style
Active left-rail room row button, bright text, no fill

```css
align-items: center;
background: transparent;
border: 0;
border-radius: 8px;
color: #f3f1ed;
display: grid;
font-size: 10px;
gap: 7px;
grid-template-columns: 13px minmax(0,1fr) 23px;
min-height: 34px;
padding: 6px 7px;
text-align: left;
```

## RailRoomItemBadge-Style
Left-rail room row button with unread badge column

```css
align-items: center;
background: transparent;
border: 0;
border-radius: 8px;
color: #929097;
display: grid;
font-size: 10px;
gap: 7px;
grid-template-columns: 13px minmax(0,1fr) 23px;
min-height: 27px;
padding: 4px 7px;
text-align: left;
```

## RailRoomItemSelected-Style
Selected left-rail room row button with dark fill

```css
align-items: center;
background: #232225;
border: 0;
border-radius: 8px;
color: #f3f1ed;
display: grid;
font-size: 10px;
gap: 7px;
grid-template-columns: 13px minmax(0,1fr) 23px;
min-height: 34px;
padding: 6px 7px;
text-align: left;
```

## RailSectionHeaderDirect-Style
Rail section header spacing variant (13px top, 6px bottom)

```css
color: #67656d;
font-size: 9px;
font-weight: 600;
letter-spacing: 0.14em;
margin-bottom: 6px;
margin-top: 13px;
padding: 0 7px;
```

## RailSectionHeaderRooms-Style
Rail section header spacing variant (14px top, 6px bottom)

```css
color: #67656d;
font-size: 9px;
font-weight: 600;
letter-spacing: 0.14em;
margin-bottom: 6px;
margin-top: 14px;
padding: 0 7px;
```

## RailSectionHeaderTeams-Style
Rail section header spacing variant (13px top, 5px bottom)

```css
color: #67656d;
font-size: 9px;
font-weight: 600;
letter-spacing: 0.14em;
margin-bottom: 5px;
margin-top: 13px;
padding: 0 7px;
```

## RecapNote-Style
Recap note text, muted 10px with 1.4 line height

```css
color: #aaa7ad;
font-size: 10px;
line-height: 1.4;
margin: 0;
```

## ReplyArrowIcon-Style
Amber 18px reply arrow glyph

```css
color: #d7a842;
font-size: 18px;
```

## ReplyContext-Style
Replying-to context line, muted 9px

```css
color: #8c8b91;
font-size: 9px;
```

## RoleLabel-Style
Message sender role, dim 10px

```css
color: #66646c;
font-size: 10px;
```

## RowFlat-Style
Marker-less single-column variant: collapses the marker column of NotificationRow/ChecklistRow grids so a row without a status dot spans full width

```css
grid-template-columns: 1fr;
```

## SceneRoot-Style
Scene root section, app background and min height

```css
background: #0b0b0d;
min-height: 860px;
width: 100%;
```

## SectionLabel-Style
Panel section header, 9px semibold wide tracking

```css
color: #67656d;
font-size: 9px;
font-weight: 600;
letter-spacing: 0.14em;
```

## SendButton-Style
30px solid light send button with dark glyph

```css
background: #f0eee8;
border: 0;
border-radius: 7px;
color: #151517;
font-weight: 700;
height: 30px;
width: 30px;
```

## SenderName-Style
Message sender name, bright 11px semibold

```css
color: #f1efec;
font-size: 11px;
font-weight: 600;
```

## SeparatorHandle-Style
34px rounded separator handle bar

```css
background: #3a393e;
border-radius: 999px;
height: 3px;
margin: 0 auto 7px;
width: 34px;
```

## SettingsDot-Style
5px gray settings toggle dot

```css
background: #6f6d75;
border-radius: 999px;
flex-shrink: 0;
height: 5px;
width: 5px;
```

## SettingsGearButton-Style
28px grid-placed gear icon button

```css
align-self: center;
background: transparent;
border: 0;
color: #8c8b91;
display: grid;
font-size: 14px;
height: 28px;
justify-self: end;
padding: 0;
place-items: center;
width: 28px;
```

## SettingsPanel-Style
Settings panel stack, 14px vertical gap

```css
display: flex;
flex-direction: column;
gap: 14px;
```

## ShellGrid-Style
App shell three-column grid (rail, main, context)

```css
display: grid;
grid-template-columns: 300px minmax(250px, 1fr) 160px;
grid-template-columns: 230px minmax(250px, 1fr) 280px;
min-height: 0;
```

## StatLabel-Style
Stats row label, muted 10px

```css
color: #aaa7ad;
font-size: 10px;
```

## StatRow-Style
Stats row: baseline flex, label left, value right

```css
align-items: baseline;
display: flex;
justify-content: space-between;
```

## StatusDotAmber-Style
7px amber presence/status dot

```css
background: #e4ae40;
border-radius: 999px;
height: 7px;
width: 7px;
```

## StatusDotGray-Style
7px gray presence/status dot

```css
background: #a8a6af;
border-radius: 999px;
height: 7px;
width: 7px;
```

## StatusDotGreen-Style
7px green presence/status dot

```css
background: #83bba0;
border-radius: 999px;
height: 7px;
width: 7px;
```

## StatValue-Style
Stats row value, bright 10px semibold

```css
color: #ececee;
font-size: 10px;
font-weight: 600;
```

## TabActive-Style
Active tab button with 2px bottom border (10px, 0 7px padding)

```css
align-items: center;
background: transparent;
border: 0;
border-bottom: 2px solid #f4f1ea;
border-radius: 0;
color: #f4f1ea;
display: flex;
font-size: 10px;
font-weight: 500;
height: 44px;
margin-bottom: -1px;
padding: 0 7px;
```

## TeamItem-Style
Left-rail team row button: icon plus name

```css
align-items: center;
background: transparent;
border: 0;
border-radius: 8px;
color: #929097;
display: grid;
font-size: 10px;
gap: 8px;
grid-template-columns: 13px minmax(0,1fr);
min-height: 26px;
padding: 4px 7px;
text-align: left;
```

## TeamListStack-Style
Teams list stack, vertical 1px gap

```css
display: flex;
flex-direction: column;
gap: 1px;
```

## TextLinkButton-Style
Quiet 9px text button (view delegation tree)

```css
background: transparent;
border: 0;
color: #8c8b91;
font-size: 9px;
padding: 4px 0;
```

## Timestamp-Style
Message timestamp, right-aligned 9px nowrap

```css
color: #66646c;
font-size: 9px;
padding-top: 2px;
text-align: right;
white-space: nowrap;
```

## Topbar-Style
Top navigation bar: three-column grid, bottom border

```css
align-items: center;
background: #111113;
border-bottom: 1px solid #2a2a2e;
display: grid;
gap: 0;
grid-template-columns: 230px minmax(250px, 1fr) 280px;
min-height: 44px;
padding: 0 10px;
```

## TopbarNavButton-Style
Top-navigation button with 8px 9px padding (no fixed height)

```css
background: transparent;
border: 0;
color: #8c8b91;
font-size: 12px;
padding: 8px 9px;
```

## TopbarTab-Style
Inactive top-navigation tab button (44px row, 12px muted text)

```css
align-items: center;
background: transparent;
border: 0;
color: #8c8b91;
display: flex;
font-size: 12px;
height: 44px;
padding: 0 7px;
```

## TopbarTabActive-Style
Active top-navigation tab, 12px with bottom border

```css
background: transparent;
border: 0;
border-bottom: 2px solid #f4f1ea;
border-radius: 0;
color: #f4f1ea;
font-size: 12px;
height: 44px;
margin-bottom: -1px;
padding: 0 7px;
```

## TopbarTabRow-Style
Top-navigation tab row container, 1px gap, stretched

```css
align-items: center;
align-self: stretch;
display: flex;
font-size: 9px;
gap: 1px;
justify-content: center;
white-space: nowrap;
```

## UsagePanel-Style
Stats usage panel stack, 10px vertical gap

```css
display: flex;
flex-direction: column;
gap: 10px;
```

## WorkingBadge-Style
Amber 11px working badge pushed right

```css
color: #e4ae40;
font-size: 11px;
font-weight: 600;
margin-left: auto;
```

