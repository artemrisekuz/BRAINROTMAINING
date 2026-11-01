-- Optional: seed existing state.json data into D1
-- Run ONLY once after 0001_init.sql if you want to migrate existing players.
-- Replace values as needed.

-- Existing accounts from state.json
INSERT OR IGNORE INTO accounts (player_id, username, name, balance) VALUES
  ('E605E6CBB1814DEE9A1B690A6C44B598', NULL, 'Гость E605E6CBB1814DEE9A1B690A6C44B598', 1245),
  ('2647A9DB021F4B6E899AD35430EEA26D', NULL, 'Гость 2647A9DB021F4B6E899AD35430EEA26D', 11),
  ('AEE60CCA8C05402DBC429787E50E2641', NULL, 'Гость AEE60CCA8C05402DBC429787E50E2641', 48174),
  ('FA212B60B91F4067B90A1523E1525513', NULL, 'Гость FA212B60B91F4067B90A1523E1525513', 7),
  ('9CF3910EB5EC401CB87EDD5E888F83D6', NULL, 'Гость 9CF3910EB5EC401CB87EDD5E888F83D6', 13),
  ('7240D4CDA1294DF888BCB3255BF9C9F7', NULL, 'Гость 7240D4CDA1294DF888BCB3255BF9C9F7', 26),
  ('TG6987783335',                     NULL, 'Admin',                                6),
  ('3DAB6439F6554B759A423442BA07E29D', NULL, 'Гость 3DAB6439F6554B759A423442BA07E29D', 2);

-- Inventory items (E605E6CBB... player) — adjust or extend as needed
INSERT OR IGNORE INTO inventory (drop_id, player_id, item_id, case_id, kind, opened_at, player_name) VALUES
  ('1793197842296-taco-lucky-block',   'E605E6CBB1814DEE9A1B690A6C44B598', 'taco-lucky-block',   'starter', 'case', '2026-10-28T14:30:42.296Z', 'Гость E605E6CBB1814DEE9A1B690A6C44B598'),
  ('1793197427138-noobini-pizzanini',  'E605E6CBB1814DEE9A1B690A6C44B598', 'noobini-pizzanini',  'starter', 'case', '2026-10-28T14:23:47.138Z', 'Гость E605E6CBB1814DEE9A1B690A6C44B598'),
  ('1793197415314-noobini-pizzanini',  'E605E6CBB1814DEE9A1B690A6C44B598', 'noobini-pizzanini',  'starter', 'case', '2026-10-28T14:23:35.314Z', 'Гость E605E6CBB1814DEE9A1B690A6C44B598'),
  ('1793196513360-noobini-pizzanini',  'E605E6CBB1814DEE9A1B690A6C44B598', 'noobini-pizzanini',  'starter', 'case', '2026-10-28T14:08:33.360Z', 'Гость E605E6CBB1814DEE9A1B690A6C44B598'),
  ('1793196494968-noobini-pizzanini',  'E605E6CBB1814DEE9A1B690A6C44B598', 'noobini-pizzanini',  'starter', 'case', '2026-10-28T14:08:14.968Z', 'Гость E605E6CBB1814DEE9A1B690A6C44B598'),
  ('1793195446857-taco-lucky-block',   'E605E6CBB1814DEE9A1B690A6C44B598', 'taco-lucky-block',   'starter', 'case', '2026-10-28T13:50:46.857Z', 'Гость E605E6CBB1814DEE9A1B690A6C44B598'),
  ('1793195429617-taco-lucky-block',   'E605E6CBB1814DEE9A1B690A6C44B598', 'taco-lucky-block',   'starter', 'case', '2026-10-28T13:50:29.617Z', 'Гость E605E6CBB1814DEE9A1B690A6C44B598'),
  ('1793195422771-noobini-pizzanini',  'E605E6CBB1814DEE9A1B690A6C44B598', 'noobini-pizzanini',  'starter', 'case', '2026-10-28T13:50:22.771Z', 'Гость E605E6CBB1814DEE9A1B690A6C44B598'),
  ('1793195412085-noobini-pizzanini',  'E605E6CBB1814DEE9A1B690A6C44B598', 'noobini-pizzanini',  'starter', 'case', '2026-10-28T13:50:12.086Z', 'Гость E605E6CBB1814DEE9A1B690A6C44B598'),
  ('1793117099090-noobini-pizzanini',  'E605E6CBB1814DEE9A1B690A6C44B598', 'noobini-pizzanini',  'starter', 'case', '2026-10-27T16:04:59.090Z', 'Гость E605E6CBB1814DEE9A1B690A6C44B598'),
  ('1793117010793-noobini-pizzanini',  'E605E6CBB1814DEE9A1B690A6C44B598', 'noobini-pizzanini',  'starter', 'case', '2026-10-27T16:03:30.793Z', 'Гость E605E6CBB1814DEE9A1B690A6C44B598'),
  ('1793117002050-taco-lucky-block',   'E605E6CBB1814DEE9A1B690A6C44B598', 'taco-lucky-block',   'starter', 'case', '2026-10-27T16:03:22.050Z', 'Гость E605E6CBB1814DEE9A1B690A6C44B598');

-- Also insert these into history table
INSERT OR IGNORE INTO history (drop_id, player_id, player_name, item_id, case_id, kind, opened_at) VALUES
  ('1793197842296-taco-lucky-block',   'E605E6CBB1814DEE9A1B690A6C44B598', 'Гость E605E6CBB1814DEE9A1B690A6C44B598', 'taco-lucky-block',  'starter', 'case', '2026-10-28T14:30:42.296Z'),
  ('1793197427138-noobini-pizzanini',  'E605E6CBB1814DEE9A1B690A6C44B598', 'Гость E605E6CBB1814DEE9A1B690A6C44B598', 'noobini-pizzanini', 'starter', 'case', '2026-10-28T14:23:47.138Z'),
  ('1793526040730-la-vacca',           'TG6987783335', '@ArkichPrivate',  'la-vacca',          'starter', 'case', '2026-11-01T09:40:40.730Z'),
  ('1793525370370-noobini-pizzanini',  'TG6987783335', '@ArkichPrivate',  'noobini-pizzanini', 'starter', 'case', '2026-11-01T09:29:30.370Z');
