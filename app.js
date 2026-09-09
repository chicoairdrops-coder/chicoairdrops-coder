(function () {
  "use strict";

  const FIELD_PATTERNS = {
    name: ["name", "nome", "miner name", "item name"],
    size: ["size", "tamanho"],
    power: ["power", "poder", "potência", "potencia"],
    bonus: ["bonus", "bônus", "bonificação", "bonificacao"],
    quantity: ["quantity", "quantidade", "qty", "qtd"],
    sellable: ["can be sold", "can't be sold", "can´t be sold"]
  };

  function normalize(value) {
    return value.trim().replace(/^[:\-–—|\s]+/, "").trim();
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function findField(block, aliases) {
    const lines = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i += 1) {
      for (const alias of aliases) {
        const pattern = new RegExp("^" + escapeRegExp(alias) + "\\s*(?::|=|-|–|—|\\|)?\\s*(.*)$", "i");
        const match = lines[i].match(pattern);
        if (match) {
          const sameLineValue = normalize(match[1] || "");
          if (sameLineValue) return sameLineValue;
          if (lines[i + 1]) return normalize(lines[i + 1]);
        }
      }
    }
    return "";
  }

  function normalizeSellable(value) {
    if (!value) return "Não informado";
    const normalized = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (/^(yes|sim|true|1|allowed|vendavel)\b/.test(normalized)) return "Sim";
    if (/^(no|nao|false|0|not allowed|untradeable|unsellable)\b/.test(normalized)) return "Não";
    return value;
  }

  function findNameAfterOpenOne(block) {
    const match = block.match(/miner\s+detai(?:ls|s)\s+open\s+1\s*(?::|=|-|–|—|\|)?\s*(?:\r?\n\s*)?([^\r\n]+)/i);
    return match ? normalize(match[1]) : "";
  }

  function findSellable(block) {
    // A forma negativa precisa ser verificada antes da positiva.
    if (/\b(?:can\s*['’´`]\s*t|cannot)\s+be\s+sold\b/i.test(block)) return "Não";
    if (/\bcan\s+be\s+sold\b/i.test(block)) return "Sim";
    return "Não informado";
  }

  function parseMinerDetails(raw) {
    const marker = /miner\s+detai(?:ls|s)/ig;
    if (!marker.test(raw)) return [];
    marker.lastIndex = 0;
    const blocks = raw.split(marker).slice(1).filter(block => block.trim());

    return blocks.map((block, index) => {
      const fields = {};
      for (const [key, aliases] of Object.entries(FIELD_PATTERNS)) fields[key] = findField(block, aliases);

      fields.name = findNameAfterOpenOne("Miner details" + block) || fields.name;

      if (!fields.name) {
        const knownLabels = Object.values(FIELD_PATTERNS).flat();
        fields.name = block.split(/\r?\n/).map(normalize).find(line => {
          if (!line) return false;
          return !knownLabels.some(label => new RegExp("^" + escapeRegExp(label) + "\\b", "i").test(line));
        }) || `Item ${index + 1}`;
      }

      return {
        name: fields.name,
        size: fields.size || "—",
        power: fields.power || "—",
        bonus: fields.bonus || "—",
        quantity: fields.quantity || "—",
        sellable: findSellable(block)
      };
    });
  }

  function createCell(value) {
    const cell = document.createElement("td");
    cell.textContent = value;
    return cell;
  }

  function render(items) {
    const body = document.querySelector("#items-body");
    body.replaceChildren();

    items.forEach(item => {
      const row = document.createElement("tr");
      row.append(createCell(item.name), createCell(item.size), createCell(item.power), createCell(item.bonus), createCell(item.quantity));
      const saleCell = document.createElement("td");
      const status = document.createElement("span");
      status.className = "sale-status " + (item.sellable === "Sim" ? "sale-yes" : item.sellable === "Não" ? "sale-no" : "sale-unknown");
      status.textContent = item.sellable;
      saleCell.append(status);
      row.append(saleCell);
      body.append(row);
    });

    document.querySelector("#count").textContent = `${items.length} ${items.length === 1 ? "item" : "itens"}`;
    document.querySelector("#results").hidden = false;
    document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function calculate() {
    const raw = document.querySelector("#raw-data").value;
    const message = document.querySelector("#message");
    const items = parseMinerDetails(raw);
    if (!raw.trim()) {
      message.textContent = "Cole os dados dos itens antes de calcular.";
      document.querySelector("#results").hidden = true;
      return;
    }
    if (!items.length) {
      message.textContent = "Não encontrei “Miner details”. Confira o texto colado e tente novamente.";
      document.querySelector("#results").hidden = true;
      return;
    }
    message.textContent = "";
    render(items);
  }

  if (typeof document !== "undefined") {
    document.querySelector("#calculate").addEventListener("click", calculate);
    document.querySelector("#raw-data").addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") calculate();
    });
  }

  if (typeof module !== "undefined") module.exports = { parseMinerDetails };
})();
