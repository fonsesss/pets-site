require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Amplify } = require('aws-amplify');
const { signIn, fetchAuthSession } = require('aws-amplify/auth');
const BRAINROTS = require('./brainrots');

// Configurações do seu bot (Puxadas do arquivo .env)
const USERNAME = process.env.ELDORADO_USER;
const PASSWORD = process.env.ELDORADO_PASS;
const USER_AGENT = process.env.ELDORADO_AGENT;

const FIXED_DESCRIPTION = `Delivery Instruction:
1. Put your @username in the chat, not display name.
2. I will make the exchange for the machine, send the link, or add you, depending on your preference.
3. Take the item 💛
4. Done ✅`;

const MUTATION_OPTIONS = [
    { id: 'cursed', titleLabel: '💀 Cursed' },
    { id: 'divine', titleLabel: '✨ Divine' },
    { id: 'none', titleLabel: '⚪ None' },
    { id: 'gold', titleLabel: '🟡 Gold' },
    { id: 'diamond', titleLabel: '💎 Diamond' },
    { id: 'bloodrot', titleLabel: '🩸 Bloodroot' },
    { id: 'candy', titleLabel: '🍬 Candy' },
    { id: 'lava', titleLabel: '🌋 Lava' },
    { id: 'galaxy', titleLabel: '🌌 Galaxy' },
    { id: 'yin-yang', titleLabel: '☯️ Yin Yang' },
    { id: 'radioactive', titleLabel: '☢️ Radioactive' },
    { id: 'rainbow', titleLabel: '🌈 Rainbow' },
    { id: 'cyber', titleLabel: '🤖 Cyber' },
];

Amplify.configure({
    Auth: { Cognito: { userPoolId: 'us-east-2_MlnzCFgHk', userPoolClientId: '1956req5ro9drdtbf5i6kis4la', loginWith: { oauth: { domain: 'login.eldorado.gg', redirectSignIn: ['https://eldorado.gg/account/auth-callback'], redirectSignOut: ['https://eldorado.gg'], responseType: 'code' } } } }
});

function normalizeText(val) { return val.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' '); }

function findBrainrot(itemName) {
    const normalizedInput = normalizeText(itemName);
    for (const [name, id] of Object.entries(BRAINROTS)) {
        if (normalizeText(name) === normalizedInput) return { matchedName: name, tradeEnvironmentId: id };
    }
    const partials = Object.entries(BRAINROTS).filter(([name]) => normalizeText(name).includes(normalizedInput));
    if (partials.length === 1) return { matchedName: partials[0][0], tradeEnvironmentId: partials[0][1] };
    throw new Error(`Item "${itemName}" não encontrado.`);
}

function getMsOption(val) {
    if (val === 0) return { id: '0' }; if (val <= 24) return { id: '0-24-ms' }; if (val <= 49) return { id: '25-49-ms' };
    if (val <= 99) return { id: '50-99-ms' }; if (val <= 249) return { id: '100-249-ms' }; if (val <= 499) return { id: '250-499-ms' };
    if (val <= 749) return { id: '500-749-ms' }; if (val <= 999) return { id: '750-999-ms' }; if (val <= 4999) return { id: '1-4-bs' };
    if (val <= 9999) return { id: '5-9-bs' }; if (val <= 19999) return { id: '10-19-bs' }; return { id: '20-plus-bs' };
}

async function getIdToken() {
    try {
        const session = await fetchAuthSession();
        if (session?.tokens?.idToken) return session.tokens.idToken.toString();
    } catch (e) { }

    try {
        await signIn({ username: USERNAME, password: PASSWORD });
    } catch (err) {
        if (!err.message.includes('already a signed in user')) throw err;
    }

    const finalSession = await fetchAuthSession();
    return finalSession?.tokens?.idToken?.toString();
}

const upload = multer({ dest: 'uploads/' });
const app = express();
app.use(express.json());

const isWeb = process.env.PORT ? true : false;

if (isWeb) {
    console.log("🌐 Servidor iniciado na Nuvem (Render) - MODO VITRINE");
    app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'market.html')));
    app.get('/market.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'market.html')));
} else {
    console.log("💻 Servidor iniciado no Computador - MODO POSTAGEM/ADM");
    app.use(express.static('public')); // Libera as páginas privadas apenas localmente
    app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
}

app.post('/api/create-offer', upload.single('imageFile'), async (req, res) => {
    let tempImagePath = null;
    try {
        if (!req.file) throw new Error("Você esqueceu de enviar a imagem do item!");
        tempImagePath = req.file.path;
        const originalName = req.file.originalname;
        const { itemName, gameValueInput, mutationId, priceInput } = req.body;

        const found = findBrainrot(itemName);
        const gameValue = Number(gameValueInput.replace(',', '.'));
        const msOption = getMsOption(gameValue);
        const mutation = MUTATION_OPTIONS.find(m => m.id === mutationId);
        const price = Number(priceInput.replace(',', '.'));

        let displayValue = gameValue;
        let unit = 'M/S';
        if (gameValue >= 1000) { displayValue = gameValue / 1000; unit = 'B/S'; }

        const idToken = await getIdToken();
        const formData = new FormData();
        const fileBuffer = fs.readFileSync(tempImagePath);
        const ext = path.extname(originalName).toLowerCase();
        let mimeType = 'image/jpeg';
        if (ext === '.png') mimeType = 'image/png';
        if (ext === '.webp') mimeType = 'image/webp';

        formData.append('image', new Blob([fileBuffer], { type: mimeType }), originalName);

        const imgRes = await fetch('https://www.eldorado.gg/api/files/me/Offer', {
            method: 'POST',
            headers: { 'User-Agent': USER_AGENT, 'Cookie': `__Host-EldoradoIdToken=${idToken}` },
            body: formData
        });

        const imgText = await imgRes.text();
        if (!imgRes.ok) throw new Error(`Falha na imagem: ${imgText}`);

        let imgData;
        try { imgData = JSON.parse(imgText); } catch (err) { throw new Error("Formato inválido."); }

        const paths = Array.isArray(imgData) ? imgData : imgData.localPaths;
        const uploadedImage = {
            smallImage: paths[0].replace('/offerimages/', ''),
            largeImage: paths[1].replace('/offerimages/', ''),
            originalSizeImage: paths[2].replace('/offerimages/', '')
        };

        const payload = {
            augmentedGame: {
                gameId: '259', category: 'CustomItem', tradeEnvironmentId: found.tradeEnvironmentId,
                offerAttributes: [
                    { id: 'steal-a-brainrot-ms', type: 'Select', value: msOption.id },
                    { id: 'steal-a-brainrot-ms-numeric', type: 'Numeric', value: gameValue },
                    { id: 'steal-a-brainrot-mutations', type: 'Select', value: mutationId }
                ]
            },
            details: {
                pricing: { quantity: 1, pricePerUnit: { amount: price, currency: 'USD' } },
                description: FIXED_DESCRIPTION,
                guaranteedDeliveryTime: 'Minute20',
                offerTitle: `${found.matchedName} ${displayValue}${unit} | ${mutation.titleLabel} | FAST DELIVERY`,
                mainOfferImage: uploadedImage
            }
        };

        const candidatePaths = ['/api/v1/item-management/me/offer/item', '/api/v1/item-management/me/offers/item', '/api/item-management/me/offer/item', '/api/item-management/me/offers/item'];
        let result, responseText = "", finalStatus = false;

        for (const urlPath of candidatePaths) {
            result = await fetch(`https://www.eldorado.gg${urlPath}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, 'Cookie': `__Host-EldoradoIdToken=${idToken}` },
                body: JSON.stringify(payload)
            });
            responseText = await result.text();
            if (result.status !== 404) { finalStatus = result.ok; break; }
        }

        if (finalStatus) res.json({ success: true, message: `Anúncio criado: ${found.matchedName}` });
        else res.status(400).json({ success: false, message: `Erro Eldorado: ${responseText}` });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (tempImagePath && fs.existsSync(tempImagePath)) fs.unlinkSync(tempImagePath);
    }
});

// --- ROTA EXCLUSIVA: MEUS ANÚNCIOS (Apenas funciona com Token de Login) ---
app.get('/api/my-offers', async (req, res) => {
    try {
        const idToken = await getIdToken(); // Pega a permissão de usuário
        const url = 'https://www.eldorado.gg/api/v1/item-management/me/offers/me/search?pageIndex=1&pageSize=50&offerState=Active';

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': USER_AGENT,
                'Cookie': `__Host-EldoradoIdToken=${idToken}; __Host-EldoradoCurrency=USD;`
            }
        });

        if (!response.ok) throw new Error(`Eldorado retornou: ${response.status}`);

        const data = await response.json();
        res.json({ success: true, data: data });
    } catch (error) {
        console.error("Erro ao buscar meus anúncios:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/schema', async (req, res) => {
    try {
        const response = await fetch('https://www.eldorado.gg/api/library/259/CustomItem?locale=en-US', { headers: { 'User-Agent': USER_AGENT } });
        res.json({ success: true, data: await response.json() });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/market', async (req, res) => {
    try {
        const { brainrot, rarity, ms, mutation, searchQuery } = req.query; // <--- Adicione o searchQuery aqui

        let url = 'https://www.eldorado.gg/api/v1/item-management/offers?gameId=259&category=CustomItem&pageIndex=1&pageSize=50&useMinPurchasePrice=true&offerSortingCriterion=Price&isAscending=true';

        if (rarity) url += `&tradeEnvironmentValue1=${encodeURIComponent(rarity)}`;
        if (brainrot) url += `&tradeEnvironmentValue2=${encodeURIComponent(brainrot)}`;
        if (ms) url += `&steal-a-brainrot-ms=${encodeURIComponent(ms)}`;
        if (mutation) url += `&steal-a-brainrot-mutations=${encodeURIComponent(mutation)}`;
        if (searchQuery) url += `&searchQuery=${encodeURIComponent(searchQuery)}`; // <--- E adicione esta linha aqui

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': USER_AGENT,
                'Cookie': '__Host-EldoradoCurrency=USD;'
            }
        });
        if (!response.ok) throw new Error(`Erro na Eldorado: ${response.status}`);
        res.json({ success: true, data: await response.json() });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.get('/api/filters', async (req, res) => {
    try {
        const response = await fetch('https://www.eldorado.gg/api/library/259/CustomItem/attributes/filters?locale=en-US', { headers: { 'User-Agent': USER_AGENT } });
        res.json({ success: true, data: await response.json() });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// ROTA PARA ATUALIZAR O PREÇO
app.put('/api/update-price/:offerId', async (req, res) => {
    try {
        const { offerId } = req.params;
        const { newPrice } = req.body; // Agora o req.body vai funcionar!
        const idToken = await getIdToken();

        console.log(`Alterando oferta ${offerId} para o preço: ${newPrice}`);

        const response = await fetch(`https://www.eldorado.gg/api/v1/item-management/me/offers/${offerId}/price`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': USER_AGENT,
                'Cookie': `__Host-EldoradoIdToken=${idToken}`
            },
            body: JSON.stringify({
                amount: newPrice,
                currency: "USD"
            })
        });

        const resText = await response.text();
        if (!response.ok) throw new Error(`Erro Eldorado: ${resText}`);

        res.json({ success: true });
    } catch (error) {
        console.error("Erro na rota de preço:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Servidor rodando na porta ${PORT}`); });