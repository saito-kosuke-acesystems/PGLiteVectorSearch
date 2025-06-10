<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useChatStore } from '@/stores/chatMessage'
import { MessageData } from '@/models/chatMessage'
import ChatForm from '@/components/ChatForm.vue'
import { initMemory } from '@/utils/pglite'
import { getDimension, getCurrentConfig, setOpenAIConfig } from '@/utils/openAI'
//import { generateEmbedding } from '@/utils/openAI'

const chatStore = useChatStore()
const messageList = computed((): Map<number, MessageData> => {
    return chatStore.messageList
})

const initialized = ref(false);
const containerRef = ref<HTMLElement | null>(null);

const scrollToBottom = () => {
    if (containerRef.value) {
        const messagesContainer = containerRef.value.querySelector('.messages-container');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
}

// baseURL, chatModel, embeddingModelの編集用（localStorage対応）
function loadConfigFromStorage() {
    const saved = localStorage.getItem('openai_config')
    if (saved) {
        try {
            return JSON.parse(saved)
        } catch { /* ignore */ }
    }
    return getCurrentConfig()
}
const config = ref(loadConfigFromStorage())

// サイドバーの開閉状態
const sidebarOpen = ref(true)
function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
}

watch(config, (val) => {
    localStorage.setItem('openai_config', JSON.stringify(val))
}, { deep: true })

function updateConfig() {
    setOpenAIConfig({
        baseURL: config.value.baseURL,
        chatModel: config.value.chatModel,
        embeddingModel: config.value.embeddingModel
    })
    localStorage.setItem('openai_config', JSON.stringify(config.value))
    window.alert('設定を更新しました')
    window.location.reload()
}

// openAI.tsのデフォルト値を取得するための定数
const defaultConfig = getCurrentConfig();

function resetConfig() {
    config.value = { ...defaultConfig };
    setOpenAIConfig(defaultConfig);
    localStorage.setItem('openai_config', JSON.stringify(defaultConfig));
    window.alert('デフォルト設定に戻しました');
    window.location.reload();
}

// 初期化処理
onMounted(() => {
    // 設定を反映
    setOpenAIConfig({
        baseURL: config.value.baseURL,
        chatModel: config.value.chatModel,
        embeddingModel: config.value.embeddingModel
    })
    // embeddingModelの次元数を取得
    getDimension().then((dimension) => {
        console.log('Embedding dimension:', dimension);
        // PGliteの初期化
        initMemory(dimension).then(() => {
            console.log('Memory initialized successfully.');
            initialized.value = true;
        }).catch((error) => {
            console.error('Error initializing memory:', error);
            window.alert('Memory initialization failed. Please check the console for details.');
        });
    }).catch((error) => {
        console.error('Error getting embedding dimension:', error);
        window.alert('Embedding model initialization failed. Please check the console for details.');
    });
})

// メッセージリストの変更を監視して自動スクロール
watch(messageList, () => {
    // DOMの更新後にスクロールを実行するため、nextTickを使用
    nextTick(() => {
        scrollToBottom();
    });
}, { deep: true });

// メッセージのフォーマット関数
function formatMessage(msg: string): string {
    return msg.replace(/\n/g, '<br>');
}
</script>

<template>
    <div class="container">
        <!-- サイドバー（設定UI） -->
        <div class="sidebar" :class="{ closed: !sidebarOpen }">
            <button class="sidebar-toggle" @click="toggleSidebar">
                <span v-if="sidebarOpen">＜</span>
                <span v-else>≡</span>
            </button>
            <template v-if="sidebarOpen">
                <label for="baseURL-input">ollama baseURL:</label>
                <input id="baseURL-input" v-model="config.baseURL" class="sidebar-input" />
                <label for="chatModel-input">chatModel:</label>
                <input id="chatModel-input" v-model="config.chatModel" class="sidebar-input" />
                <label for="embeddingModel-input">embeddingModel:</label>
                <input id="embeddingModel-input" v-model="config.embeddingModel" class="sidebar-input" />
                <div style="margin-top: 8px;">
                    <button @click="updateConfig" style="margin-right: 8px;">反映</button>
                    <button @click="resetConfig">デフォルトに戻す</button>
                </div>
            </template>
        </div>
        <!-- メインコンテンツ（チャット） -->
        <div class="main-content" ref="containerRef">
            <div class="messages-container">
                <template v-for="[id, message] in messageList" v-bind:key="id">
                    <div class="message-wrapper" :class="{ user: !message.isBot }">
                        <div v-if="message.isBot" class="bot-message" v-html="formatMessage(message.message)"></div>
                        <div v-else class="user-message">{{ message.message }}</div>
                    </div>
                </template>
            </div>
            <div class="form-container">
                <ChatForm v-if="initialized"/>
            </div>
        </div>
    </div>
</template>

<style scoped>
.container {
    display: flex;
    flex-direction: row;
    height: calc(100vh - 40px);
    position: fixed;
    top: 0px;
    left: 0px;
    right: 0px;
    bottom: 20px;
    background: #fff;
}
.sidebar {
    width: 270px;
    min-width: 48px;
    background: #f4f6fa;
    border-right: 1px solid #ddd;
    padding: 24px 16px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-sizing: border-box;
    transition: width 0.2s;
    position: relative;
}
.sidebar.closed {
    width: 48px;
    min-width: 48px;
    padding: 16px 4px 16px 4px;
    align-items: center;
    overflow: hidden;
}
.sidebar-toggle {
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    z-index: 2;
    padding: 4px;
}
.sidebar.closed .sidebar-toggle {
    right: 8px;
    left: 8px;
}
.main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
    position: relative;
    height: 100%;
}
.message-wrapper {
    width: 100%;
    display: flex;
    justify-content: flex-start;
    margin: 10px 0;
}

.message-wrapper.user {
    justify-content: flex-end;
}

.user-message {
    max-width: 80%;
    padding: 10px;
    border-radius: 15px;
    border: 1px solid #ccc;
    background-color: #e6f2ff;
    margin-right: 20px;
}

.bot-message {
    max-width: 80%;
    padding: 10px;
    border-radius: 15px;
    border: 1px solid #ccc;
    background-color: #f8f9fa;
    margin-left: 20px;
}

/* メッセージリストを含む領域 */
.messages-container {
    flex: 1;
    overflow-y: auto;
    margin-bottom: 60px; /* ChatFormのための空間 */
}

/* フォーム領域を固定 */
.form-container {
    position: fixed;
    bottom: 20px;
    left: 20px;
    right: 20px;
    background-color: white;
    padding: 10px 0;
}

.sidebar-input {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
    margin-bottom: 8px;
    padding: 6px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 15px;
    background: #fff;
}
</style>