<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useChatStore } from '@/stores/chatMessage'
import { MessageData } from '@/models/chatMessage'
import ChatForm from '@/components/ChatForm.vue'
import { initMemory } from '@/utils/pglite'
import { getDimension } from '@/utils/openAI'
//import { generateEmbedding } from '@/utils/openAI'

const chatStore = useChatStore()
const messageList = computed((): Map<number, MessageData> => {
    return chatStore.messageList
})

const initialized = ref(false);

// 初期化処理
onMounted(() => {
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

// メッセージのフォーマット関数
function formatMessage(msg: string): string {
    return msg.replace(/\n/g, '<br>');
}
</script>

<template>
    <div class="container">
        <template v-for="[id, message] in messageList" v-bind:key="id">
            <div v-if="message.isBot" class="bot-message" v-html="formatMessage(message.message)"></div>
            <div v-else class="user-message">{{ message.message }}</div>
        </template>
        <ChatForm v-if="initialized"/>
    </div>
</template>

<style scoped>
.user-message {
    max-width: 80%;
    width: auto;
    margin: 10px;
    padding: 10px;
    border-radius: 5px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
    align-self: flex-end;
    background-color: #2d81d8;
    color: white;
}

.bot-message {
    max-width: 80%;
    width: auto;
    margin: 10px;
    padding: 10px;
    border-radius: 5px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
    align-self: flex-start;
    background-color: #f2f2f2;
}

.container {
    flex: 1;
    padding: 20px;
    padding-bottom: 70px !important;
    display: flex;
    flex-direction: column;
}
</style>