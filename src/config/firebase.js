// Classe para gerenciar Firebase
class FirebaseManager {
    constructor() {
        this.isInitialized = false;
        this.db = null;
        this.auth = null;
        this.currentUser = null;
        this.authStateListener = null;
        /** @type {Promise<boolean>|null} */
        this._initPromise = null;
    }

    // Inicializar Firebase
    async initialize() {
        if (this.isInitialized) return true;
        if (this._initPromise) return this._initPromise;

        this._initPromise = (async () => {
            try {
                if (!window.firebase || !window.firebaseSDK) {
                    console.error('Firebase não foi carregado. Verifique se o CDN está funcionando.');
                    return false;
                }

                this.db = window.firebase.db;
                this.auth = window.firebase.auth;

                this.setupAuthStateListener();

                // Em mobile, a sessão persistida (IndexedDB) restaura de forma assíncrona;
                // sem isto, getCurrentUser() pode ser null logo após init e a UI fica presa em "Conectando...".
                if (typeof this.auth.authStateReady === 'function') {
                    await this.auth.authStateReady();
                }

                this.isInitialized = true;
                console.log('Firebase inicializado com sucesso!');
                return true;
            } catch (error) {
                console.error('Erro ao inicializar Firebase:', error);
                return false;
            } finally {
                this._initPromise = null;
            }
        })();

        return this._initPromise;
    }

    /** Garante que Auth está pronto antes de signIn/signUp/etc. (evita "Auth não inicializado" se o utilizador for rápido). */
    async ensureInitialized() {
        const ok = await this.initialize();
        if (!ok || !this.auth) {
            if (typeof window !== 'undefined' && window.__firebaseInitError === 'missing_config') {
                throw new Error(
                    'Configuração Firebase em falta. Copia firebase-config.example.js para firebase-config.js ou verifica o index.html.',
                );
            }
            if (typeof window !== 'undefined' && window.__firebaseInitError === 'init_failed') {
                throw new Error(
                    'Não foi possível iniciar o Firebase. Recarrega a página ou verifica bloqueios de rede / extensões.',
                );
            }
            throw new Error(
                'Firebase não está disponível. Recarrega a página ou verifica a ligação à internet.',
            );
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
            await this.ensureInitialized();

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
                
                // Atualizar o usuário atual com o novo displayName
                this.currentUser = {
                    ...userCredential.user,
                    displayName: displayName
                };
            } else {
                this.currentUser = userCredential.user;
            }
            
            console.log('Usuário registrado:', this.currentUser.email, 'Nome:', this.currentUser.displayName);
            return this.currentUser;
            
        } catch (error) {
            console.error('Erro no registro:', error);
            throw this.translateFirebaseError(error);
        }
    }

    // Fazer login
    async signIn(email, password) {
        try {
            await this.ensureInitialized();

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
            const ok = await this.initialize();
            if (ok && this.auth) {
                await this.auth.signOut();
            }
            this.currentUser = null;
            console.log('Logout realizado');
        } catch (error) {
            console.error('Erro no logout:', error);
            throw error;
        }
    }

    // Redefinir senha
    async resetPassword(email) {
        try {
            await this.ensureInitialized();

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
        if (!this.currentUser) return 'Usuário';
        
        // Verificar se o displayName existe e não está vazio
        if (this.currentUser.displayName && this.currentUser.displayName.trim() !== '') {
            return this.currentUser.displayName;
        }
        
        // Fallback para email se não tiver nome
        if (this.currentUser.email) {
            return this.currentUser.email.split('@')[0]; // Primeira parte do email
        }
        
        return 'Usuário';
    }

    // Métodos para operações de dados
    async addWeightRecord(data) {
        if (!this.isAvailable()) {
            throw new Error('Firebase não está disponível ou usuário não autenticado');
        }

        try {
            const ts =
                typeof data.timestamp === 'number' && Number.isFinite(data.timestamp)
                    ? data.timestamp
                    : Date.now();
            const recordData = {
                mes: data.mes,
                semana: data.semana,
                peso: data.peso,
                data: data.data,
                userId: this.currentUser.uid,
                timestamp: ts,
                createdAt: new Date().toISOString(),
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
            
            if (doc.exists) {
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

    /** Preferência de tema na coleção users/{uid} (merge) */
    async saveUserThemePreference(theme) {
        if (!this.isAvailable() || !this.currentUser) return;
        const value = theme === 'light' ? 'light' : 'dark';
        try {
            const docRef = window.firebaseSDK.doc(this.db, 'users', this.currentUser.uid);
            await window.firebaseSDK.setDoc(
                docRef,
                {
                    theme: value,
                    preferencesUpdatedAt: window.firebaseSDK.serverTimestamp(),
                },
                { merge: true },
            );
        } catch (e) {
            console.warn('Não foi possível guardar tema na nuvem:', e);
        }
    }

    async loadUserThemePreference() {
        if (!this.isAvailable() || !this.currentUser) return null;
        try {
            const docRef = window.firebaseSDK.doc(this.db, 'users', this.currentUser.uid);
            const snap = await window.firebaseSDK.getDoc(docRef);
            if (snap.exists) {
                const t = snap.data().theme;
                if (t === 'light' || t === 'dark') return t;
            }
        } catch (e) {
            console.warn('Não foi possível ler tema na nuvem:', e);
        }
        return null;
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
