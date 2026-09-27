// История слотов аккаунта по конкретным слотам (slot1..slot5).
// Два слота П3 называются одинаково, поэтому у каждого заказа определяем точный слот:
// у новых заказов он записан сервером (slotField), у старых — восстанавливаем, проходя историю
// по порядку: продажа занимает первый свободный слот, возврат освобождает слот того же клиента.

export type SlotHistoryRow = {
  id?: string;
  slotField?: string | null;
  client: string;
  slot: string;
  date: string;
  price: number | null;
  event: string;
};

export type SlotOccupant = { client: string; orderId: string | null; price: number | null; field: string };

export function slotNamesFor(hasBoth: boolean) {
  return hasBoth ? ["PS5 П3", "PS5 П3", "PS5 П2", "PS4 П3", "PS4 П2"] : ["П3", "П3", "П2"];
}

// Колонки аккаунта для названия слота: у П3 их две
function fieldsForBase(base: string, hasBoth: boolean) {
  return slotNamesFor(hasBoth)
    .map((name, i) => (name === base ? `slot${i + 1}` : ""))
    .filter(Boolean);
}

export function isFreeingRow(row: SlotHistoryRow) {
  return row.event === "manual_free" || /^возврат/i.test(row.slot.trim());
}

export function baseSlotName(slot: string) {
  return slot.trim().replace(/^возврат\s*/i, "").trim();
}

// occupiedFlags — отметки слотов аккаунта из каталога (true = занят); по ним поправляем
// восстановленную картину, если старые возвраты освобождали «не тот» слот П3
export function assignSlotFields(history: SlotHistoryRow[], hasBoth: boolean, occupiedFlags: boolean[] = []) {
  const occupants: Record<string, SlotOccupant | null> = {};
  const rows: (SlotHistoryRow & { field: string | null })[] = [];

  for (const row of history) {
    const base = baseSlotName(row.slot);
    const fields = fieldsForBase(base, hasBoth);
    if (fields.length === 0) {
      rows.push({ ...row, field: null });
      continue;
    }
    const freeing = isFreeingRow(row);
    let field = row.slotField && fields.includes(row.slotField) ? row.slotField : null;

    if (!field && !freeing) {
      field = fields.find((f) => !occupants[f]) ?? fields[fields.length - 1];
    }
    if (!field && freeing) {
      const name = row.client.trim().toLowerCase();
      field =
        fields.find((f) => occupants[f]?.client.trim().toLowerCase() === name) ??
        [...fields].reverse().find((f) => occupants[f]) ??
        fields[0];
    }

    occupants[field!] = freeing
      ? null
      : {
          client: row.event === "manual_occupy" ? "" : row.client,
          orderId: row.event ? null : row.id ?? null,
          price: row.event ? null : row.price,
          field: field!,
        };
    rows.push({ ...row, field });
  }

  // Сверка с отметками каталога: клиент «сидит» на свободном по каталогу слоте П3,
  // а соседний П3 занят и пуст — значит, старый возврат освободил не тот слот, переносим
  for (const base of new Set(slotNamesFor(hasBoth))) {
    const fields = fieldsForBase(base, hasBoth);
    if (fields.length < 2 || occupiedFlags.length === 0) continue;
    const flag = (f: string) => occupiedFlags[Number(f.slice(4)) - 1];
    for (const f of fields) {
      const other = fields.find((x) => x !== f)!;
      if (occupants[f] && !flag(f) && flag(other) && !occupants[other]) {
        const moved = occupants[f]!;
        occupants[other] = { ...moved, field: other };
        occupants[f] = null;
        // Заказ этого клиента тоже относим к его настоящему слоту
        for (const row of rows) {
          if (row.field === f && moved.orderId && row.id === moved.orderId) row.field = other;
        }
      }
    }
  }

  return { rows, occupants };
}
