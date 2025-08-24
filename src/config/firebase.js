// Classe para gerenciar Firebase
class FirebaseManager {
    constructor() {
        this.isInitialized = false;
        this.db = null;
        this.auth = null;
        this.currentUser = null;
    }

    // Inicializar Firebase
    async initialize() {
        try {
            // Verificar se Firebase está disponível
            if (!window.firebase || !window.firebaseSDK) {
                console.error('Firebase não foi carregado. Verifique se o CDN está funcionando.');
                return false;
            }

            // Usar instâncias já inicializadas
            this.db = window.firebase.db;
            this.auth = window.firebase.auth;
            
            // Configurar listener de autenticação
            window.firebaseSDK.onAuthStateChanged(this.auth, (user) => {
                this.currentUser = user;
                console.log('Usuário autenticado:', user ? user.uid : 'Nenhum');
            });

            this.isInitialized = true;
            console.log('Firebase inicializado com sucesso!');
            return true;

        } catch (error) {
            console.error('Erro ao inicializar Firebase:', error);
            return false;
        }
    }

    // Verificar se Firebase está disponível
    isAvailable() {
        return this.isInitialized && this.db !== null;
    }

    // Obter usuário atual
    getCurrentUser() {
        return this.currentUser;
    }

    // Métodos para operações de dados
    async addWeightRecord(data) {
        if (!this.isAvailable()) {
            throw new Error('Firebase não está disponível');
        }

        try {
            const userId = this.currentUser ? this.currentUser.uid : 'anonymous';
            const recordData = {
                ...data,
                userId: userId,
                createdAt: window.firebaseSDK.serverTimestamp(),
                updatedAt: window.firebaseSDK.serverTimestamp()
            };

            const docRef = await window.firebaseSDK.addDoc(
                window.firebaseSDK.collection(this.db, 'weightRecords'), 
                recordData
            );
            console.log('Registro adicionado com ID:', docRef.id);
            return docRef.id;

        } catch (error) {
            console.error('Erro ao adicionar registro:', error);
            throw error;
        }
    }

    async getWeightRecords() {
        if (!this.isAvailable()) {
            throw new Error('Firebase não está disponível');
        }

        try {
            const userId = this.currentUser ? this.currentUser.uid : 'anonymous';
            const q = window.firebaseSDK.query(
                window.firebaseSDK.collection(this.db, 'weightRecords'),
                window.firebaseSDK.where('userId', '==', userId),
                window.firebaseSDK.orderBy('createdAt', 'desc')
            );

            const snapshot = await window.firebaseSDK.getDocs(q);
            const records = [];
            snapshot.forEach(doc => {
                records.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            return records;

        } catch (error) {
            console.error('Erro ao buscar registros:', error);
            throw error;
        }
    }

    async updateWeightRecord(recordId, data) {
        if (!this.isAvailable()) {
            throw new Error('Firebase não está disponível');
        }

        try {
            const updateData = {
                ...data,
                updatedAt: window.firebaseSDK.serverTimestamp()
            };

            const docRef = window.firebaseSDK.doc(this.db, 'weightRecords', recordId);
            await window.firebaseSDK.updateDoc(docRef, updateData);
            console.log('Registro atualizado:', recordId);

        } catch (error) {
            console.error('Erro ao atualizar registro:', error);
            throw error;
        }
    }

    async deleteWeightRecord(recordId) {
        if (!this.isAvailable()) {
            throw new Error('Firebase não está disponível');
        }

        try {
            const docRef = window.firebaseSDK.doc(this.db, 'weightRecords', recordId);
            await window.firebaseSDK.deleteDoc(docRef);
            console.log('Registro deletado:', recordId);

        } catch (error) {
            console.error('Erro ao deletar registro:', error);
            throw error;
        }
    }

    // Métodos de autenticação
    async signInAnonymously() {
        if (!this.auth) {
            throw new Error('Autenticação não está disponível');
        }

        try {
            const result = await window.firebaseSDK.signInAnonymously(this.auth);
            console.log('Usuário anônimo conectado:', result.user.uid);
            return result.user;

        } catch (error) {
            console.error('Erro ao conectar anonimamente:', error);
            throw error;
        }
    }

    async signOut() {
        if (!this.auth) {
            throw new Error('Autenticação não está disponível');
        }

        try {
            await this.auth.signOut();
            console.log('Usuário desconectado');

        } catch (error) {
            console.error('Erro ao desconectar:', error);
            throw error;
        }
    }
}

// Instância global
const firebaseManager = new FirebaseManager();

// Exportar
export { firebaseConfig, firebaseManager };
