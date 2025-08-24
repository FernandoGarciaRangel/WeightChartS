// Classe para gerenciar Firebase
class FirebaseManager {
    constructor() {
        this.isInitialized = false;
        this.db = null;
        this.auth = null;
        this.currentUser = null;
        this.authStateListener = null;
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
            
            // Configurar listener de estado de autenticação
            this.setupAuthStateListener();
            
            this.isInitialized = true;
            console.log('Firebase inicializado com sucesso!');
            return true;

        } catch (error) {
            console.error('Erro ao inicializar Firebase:', error);
            return false;
        }
    }

    // Configurar listener de estado de autenticação
    setupAuthStateListener() {
        this.authStateListener = window.firebaseSDK.onAuthStateChanged(this.auth, (user) => {
            if (user) {
                this.currentUser = user;
                console.log('Usuário autenticado:', user.email);
                // Disparar evento para a aplicação saber que o usuário mudou
                window.dispatchEvent(new CustomEvent('userAuthChanged', { detail: { user } }));
            } else {
                this.currentUser = null;
                console.log('Usuário não autenticado');
                window.dispatchEvent(new CustomEvent('userAuthChanged', { detail: { user: null } }));
            }
        });
    }

    // Registrar novo usuário
    async signUp(email, password, displayName = '') {
        try {
            if (!this.auth) {
                throw new Error('Auth não inicializado');
            }
            
            const userCredential = await window.firebaseSDK.createUserWithEmailAndPassword(
                this.auth, 
                email, 
                password
            );
            
            // Atualizar nome do usuário se fornecido
            if (displayName) {
                await window.firebaseSDK.updateProfile(userCredential.user, {
                    displayName: displayName
                });
            }
            
            this.currentUser = userCredential.user;
            console.log('Usuário registrado:', this.currentUser.email);
            return this.currentUser;
            
        } catch (error) {
            console.error('Erro no registro:', error);
            throw this.translateFirebaseError(error);
        }
    }

    // Fazer login
    async signIn(email, password) {
        try {
            if (!this.auth) {
                throw new Error('Auth não inicializado');
            }
            
            const userCredential = await window.firebaseSDK.signInWithEmailAndPassword(
                this.auth, 
                email, 
                password
            );
            
            this.currentUser = userCredential.user;
            console.log('Login realizado:', this.currentUser.email);
            return this.currentUser;
            
        } catch (error) {
            console.error('Erro no login:', error);
            throw this.translateFirebaseError(error);
        }
    }

    // Fazer logout
    async signOut() {
        try {
            if (this.auth) {
                await this.auth.signOut();
                this.currentUser = null;
                console.log('Logout realizado');
            }
        } catch (error) {
            console.error('Erro no logout:', error);
            throw error;
        }
    }

    // Redefinir senha
    async resetPassword(email) {
        try {
            if (!this.auth) {
                throw new Error('Auth não inicializado');
            }
            
            await window.firebaseSDK.sendPasswordResetEmail(this.auth, email);
            console.log('Email de redefinição enviado');
            
        } catch (error) {
            console.error('Erro ao enviar email de redefinição:', error);
            throw this.translateFirebaseError(error);
        }
    }

    // Atualizar perfil do usuário
    async updateProfile(displayName, photoURL = null) {
        try {
            if (!this.currentUser) {
                throw new Error('Usuário não autenticado');
            }
            
            await window.firebaseSDK.updateProfile(this.currentUser, {
                displayName: displayName,
                photoURL: photoURL
            });
            
            console.log('Perfil atualizado');
            
        } catch (error) {
            console.error('Erro ao atualizar perfil:', error);
            throw error;
        }
    }

    // Traduzir erros do Firebase para português
    translateFirebaseError(error) {
        const errorMessages = {
            'auth/user-not-found': 'Usuário não encontrado',
            'auth/wrong-password': 'Senha incorreta',
            'auth/email-already-in-use': 'Este email já está em uso',
            'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres',
            'auth/invalid-email': 'Email inválido',
            'auth/too-many-requests': 'Muitas tentativas. Tente novamente em alguns minutos',
            'auth/network-request-failed': 'Erro de conexão. Verifique sua internet'
        };
        
        return new Error(errorMessages[error.code] || error.message);
    }

    // Verificar se Firebase está disponível
    isAvailable() {
        return this.isInitialized && this.db !== null && this.currentUser !== null;
    }

    // Verificar se usuário está autenticado
    isAuthenticated() {
        return this.currentUser !== null;
    }

    // Obter usuário atual
    getCurrentUser() {
        return this.currentUser;
    }

    // Obter ID do usuário atual
    getCurrentUserId() {
        return this.currentUser ? this.currentUser.uid : null;
    }

    // Obter email do usuário atual
    getCurrentUserEmail() {
        return this.currentUser ? this.currentUser.email : null;
    }

    // Obter nome do usuário atual
    getCurrentUserDisplayName() {
        return this.currentUser ? (this.currentUser.displayName || 'Usuário') : 'Usuário';
    }

    // Métodos para operações de dados
    async addWeightRecord(data) {
        if (!this.isAvailable()) {
            throw new Error('Firebase não está disponível ou usuário não autenticado');
        }

        try {
            const recordData = {
                ...data,
                userId: this.currentUser.uid, // Adicionar ID do usuário
                userEmail: this.currentUser.email, // Adicionar email do usuário
                timestamp: Date.now(),
                createdAt: new Date().toISOString()
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
            throw new Error('Firebase não está disponível ou usuário não autenticado');
        }

        try {
            // Filtrar registros apenas do usuário atual
            const q = window.firebaseSDK.query(
                window.firebaseSDK.collection(this.db, 'weightRecords'),
                window.firebaseSDK.where('userId', '==', this.currentUser.uid)
            );
            
            const snapshot = await window.firebaseSDK.getDocs(q);
            
            const records = [];
            snapshot.forEach(doc => {
                records.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // Ordenar localmente para evitar índices
            records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            return records;

        } catch (error) {
            console.error('Erro ao buscar registros:', error);
            throw error;
        }
    }

    async updateWeightRecord(recordId, data) {
        if (!this.isAvailable()) {
            throw new Error('Firebase não está disponível ou usuário não autenticado');
        }

        try {
            // Verificar se o registro pertence ao usuário atual
            const record = await this.getWeightRecordById(recordId);
            if (!record || record.userId !== this.currentUser.uid) {
                throw new Error('Registro não encontrado ou não pertence ao usuário');
            }

            const updateData = {
                ...data,
                updatedAt: new Date().toISOString()
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
            throw new Error('Firebase não está disponível ou usuário não autenticado');
        }

        try {
            // Verificar se o registro pertence ao usuário atual
            const record = await this.getWeightRecordById(recordId);
            if (!record || record.userId !== this.currentUser.uid) {
                throw new Error('Registro não encontrado ou não pertence ao usuário');
            }

            const docRef = window.firebaseSDK.doc(this.db, 'weightRecords', recordId);
            await window.firebaseSDK.deleteDoc(docRef);
            console.log('Registro deletado:', recordId);

        } catch (error) {
            console.error('Erro ao deletar registro:', error);
            throw error;
        }
    }

    async getWeightRecordById(recordId) {
        if (!this.isAvailable()) {
            throw new Error('Firebase não está disponível ou usuário não autenticado');
        }

        try {
            const docRef = window.firebaseSDK.doc(this.db, 'weightRecords', recordId);
            const doc = await window.firebaseSDK.getDoc(docRef);
            
            if (doc.exists()) {
                return { id: doc.id, ...doc.data() };
            }
            return null;

        } catch (error) {
            console.error('Erro ao buscar registro:', error);
            throw error;
        }
    }

    async clearAllUserData() {
        if (!this.isAvailable()) {
            throw new Error('Firebase não está disponível ou usuário não autenticado');
        }

        try {
            // Buscar todos os registros do usuário
            const records = await this.getWeightRecords();
            
            // Deletar cada registro
            const deletePromises = records.map(record => 
                this.deleteWeightRecord(record.id)
            );
            
            await Promise.all(deletePromises);
            console.log('Todos os dados do usuário foram removidos');

        } catch (error) {
            console.error('Erro ao limpar dados:', error);
            throw error;
        }
    }

    // Limpar listener quando não for mais necessário
    cleanup() {
        if (this.authStateListener) {
            this.authStateListener();
            this.authStateListener = null;
        }
    }
}

// Instância global
const firebaseManager = new FirebaseManager();

// Exportar
export { firebaseManager };
