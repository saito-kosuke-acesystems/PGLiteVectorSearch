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
            </button>            <template v-if="sidebarOpen">
                <label for="baseURL-input" class="sidebar-label">ollama baseURL:</label>
                <input id="baseURL-input" v-model="config.baseURL" class="sidebar-input" />
                <label for="chatModel-input" class="sidebar-label">chatModel:</label>
                <input id="chatModel-input" v-model="config.chatModel" class="sidebar-input" />                <label for="embeddingModel-input" class="sidebar-label">embeddingModel:</label>                  <input id="embeddingModel-input" v-model="config.embeddingModel" class="sidebar-input" />
                <div style="margin-top: 8px; display: flex; justify-content: space-between;">
                    <button @click="resetConfig" class="config-btn reset-btn" title="デフォルト設定に戻します">リセット</button>
                    <button @click="updateConfig" class="config-btn" title="設定を適用します">適用</button>
                </div>
            </template>        </div>        <!-- メインコンテンツ（チャット） -->
        <div class="main-content" ref="containerRef">
            <div class="messages-container">
                <template v-for="[id, message] in messageList" v-bind:key="id">
                    <div class="message-wrapper" :class="{ user: !message.isBot }">
                        <div v-if="message.isBot" class="bot-message" v-html="formatMessage(message.message)"></div>
                        <div v-else class="user-message">{{ message.message }}</div>
                    </div>
                </template>
            </div>
            
            <!-- チャットフォーム（画面下部） -->
            <div class="chat-form-bottom" v-if="initialized">
                <ChatForm />
            </div>
        </div>
    </div>
</template>

<style scoped>
.container {
    display: flex;
    flex-direction: row;
    height: 100vh;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #fff;
    margin: 0;
    padding: 0;
    overflow: hidden;
}
.sidebar {
    width: 270px;
    min-width: 48px;
    background: #f8f9fa;
    border-right: 1px solid #ddd;
    padding: 24px 16px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-sizing: border-box;
    transition: width 0.2s;
    position: relative;
    height: 100%;
    margin: 0;
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
    background: #28a745;
    border: none;
    color: white;
    font-size: 16px;
    cursor: pointer;
    z-index: 2;
    padding: 4px 8px;
    border-radius: 4px;
    transition: background 0.2s;
    height: 39px; /* チャットフォームのボタンと同じ高さに設定 */
    line-height: 1.2;
    box-sizing: border-box;
}

.sidebar-toggle:hover {
    background: #218838;
}

.sidebar.closed .sidebar-toggle {
    right: 8px;
    left: 8px;
}
.main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    height: 100%;
    padding: 0;
    margin: 0;
    overflow: hidden;
}
.chat-form-bottom {
    border-top: 1px solid #ddd;
    background: #f8f9fa;
    padding: 16px 20px;
    margin: 0;
    width: 100%;
    box-sizing: border-box;
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
    padding: 20px;
    box-sizing: border-box;
    margin: 0;
}

/* フォーム領域のスタイルは不要になったため削除 */

.sidebar-input {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
    margin-bottom: 8px;
    padding: 10px;
    border: 2px solid #007bff;
    border-radius: 5px;
    font-size: 15px;
    background: #fff;
    outline: none;
    transition: border-color 0.2s;
}

.sidebar-input:focus {
    border-color: #0056b3;
    background-color: #eaf4ff;
}

.config-btn {
    font-size: 16px;
    padding: 8px 12px;
    border-radius: 4px;
    background: #28a745;
    border: none;
    color: white;
    transition: background 0.2s;
    cursor: pointer;
    flex: 1;
    margin: 0 5px;
    height: 39px; /* チャットフォームのボタンと同じ高さに設定 */
    line-height: 1.2;
    box-sizing: border-box;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.reset-btn {
    background: #6c757d;
}

.config-btn:hover {
    background: #218838;
}

.reset-btn:hover {
    background: #5a6268;
}

.sidebar-label {
    margin-bottom: 4px;
    font-size: 15px;
    color: #333;
    font-weight: 500;
}
</style>