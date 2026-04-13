// frontend/app/(tabs)/index.tsx
import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, FlatList, TouchableOpacity, 
  ActivityIndicator, Alert, SafeAreaView, StatusBar, TextInput, Modal, KeyboardAvoidingView, Platform 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ✅ CRITICAL: Use cloud URL for phone testing
const API_URL = 'https://kottu-backend.onrender.com';
// For local testing only, change to: 'http://192.168.31.63:8000' (your laptop IP)

type User = { id: number; name: string; phone: string; role: 'customer' | 'shopkeeper'; shop_name: string; token?: string } | null;
type Shop = { id: number; name: string; shop_name: string };
type Product = { id: number; name: string; price: number; stock: number };
type Order = { id: number; item_id: number; customer_name: string; quantity: number; status: string; created_at: string };
type UdhaarEntry = { customer_name: string; balance: number };
type AlertItem = { type: string; item: string; message: string; priority: string };
type UdhaarModalState = { customer_name: string; amount: number; type: 'credit' | 'payment'; note: string } | null;

export default function App() {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', phone: '', password: '', role: 'customer' as 'customer' | 'shopkeeper', shop_name: '' });
  const [authLoading, setAuthLoading] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);

  useEffect(() => { loadSession(); }, []);

  const loadSession = async () => {
    try {
      const savedUser = await AsyncStorage.getItem('kottu_user');
      const savedShop = await AsyncStorage.getItem('kottu_selected_shop');
      if (savedUser) {
        setUser(JSON.parse(savedUser) as User);
        if (savedShop) setSelectedShop(JSON.parse(savedShop) as Shop);
      }
    } catch(e: any) { console.log('Load session error:', e.message); }
    finally { setLoading(false); }
  };

  const handleAuth = async () => {
    const { name, phone, password, role, shop_name } = formData;
    if(!phone || password.length < 4) return Alert.alert('Error', 'Phone & Password (min 4) required');
    if(!isLogin && !name) return Alert.alert('Error', 'Name required');

    setAuthLoading(true);
    try {
      const endpoint = isLogin ? 'login' : 'register';
      const body: any = { phone, password };
      if(!isLogin) { body.name = name; body.role = role; body.shop_name = role === 'shopkeeper' ? shop_name : ''; }

      console.log(`🔐 Calling ${API_URL}/api/auth/${endpoint} with`, body);
      const res = await fetch(`${API_URL}/api/auth/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const data = await res.json();
      console.log('🔐 Auth response:', data);
      
      if(data.error) throw new Error(data.error);
      
      const userData: User = { 
        id: data.user_id || data.id, 
        name: data.name, 
        phone, 
        role: data.role || role, 
        shop_name: data.shop_name || shop_name,
        token: data.token 
      };
      await AsyncStorage.setItem('kottu_user', JSON.stringify(userData));
      setUser(userData);
      if(data.role === 'customer') setSelectedShop(null);
      Alert.alert('Success', `Welcome, ${userData.name}!`);
    } catch(e: any) { 
      console.log('❌ Auth error:', e.message);
      Alert.alert('Failed', e.message || 'Unknown error'); 
    }
    finally { setAuthLoading(false); }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('kottu_user');
    await AsyncStorage.removeItem('kottu_selected_shop');
    setUser(null); setSelectedShop(null);
    setFormData({ name: '', phone: '', password: '', role: 'customer', shop_name: '' });
  };

  if(loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2E7D32" /><Text style={{marginTop:10}}>Loading...</Text></View>;
  if(!user) return <AuthScreen isLogin={isLogin} setIsLogin={setIsLogin} formData={formData} setFormData={setFormData} handleAuth={handleAuth} authLoading={authLoading} />;

  return <MainApp user={user} selectedShop={selectedShop} setSelectedShop={setSelectedShop} onLogout={logout} />;
}

function AuthScreen({ isLogin, setIsLogin, formData, setFormData, handleAuth, authLoading }: {
  isLogin: boolean; setIsLogin: (v: boolean) => void;
  formData: { name: string; phone: string; password: string; role: 'customer' | 'shopkeeper'; shop_name: string };
  setFormData: (v: any) => void; handleAuth: () => Promise<void>; authLoading: boolean;
}) {
  return (
    <SafeAreaView style={styles.authContainer}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex:1}}>
        <View style={styles.authBox}>
          <Text style={styles.authTitle}>🛒 KOTTU</Text>
          <Text style={styles.authSub}>Multi-Shop Platform</Text>
          <Text style={styles.authToggle}>{isLogin ? 'Login' : 'Sign Up'}</Text>
          {!isLogin && <TextInput style={styles.authInput} placeholder="Full Name" value={formData.name} onChangeText={v=>setFormData({...formData, name:v})} />}
          <TextInput style={styles.authInput} placeholder="Phone" keyboardType="phone-pad" value={formData.phone} onChangeText={v=>setFormData({...formData, phone:v})} />
          <TextInput style={styles.authInput} placeholder="Password (min 4)" secureTextEntry value={formData.password} onChangeText={v=>setFormData({...formData, password:v})} />
          {!isLogin && (
            <>
              <View style={styles.roleBox}>
                <TouchableOpacity style={[styles.roleBtn, formData.role==='customer' && styles.roleActive]} onPress={()=>setFormData({...formData, role:'customer'})}><Text style={styles.roleTxt}>🛍️ Customer</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.roleBtn, formData.role==='shopkeeper' && styles.roleActive]} onPress={()=>setFormData({...formData, role:'shopkeeper'})}><Text style={styles.roleTxt}>🏪 Shopkeeper</Text></TouchableOpacity>
              </View>
              {formData.role==='shopkeeper' && <TextInput style={styles.authInput} placeholder="Shop Name" value={formData.shop_name} onChangeText={v=>setFormData({...formData, shop_name:v})} />}
            </>
          )}
          <TouchableOpacity style={styles.authBtn} onPress={handleAuth} disabled={authLoading}>
            <Text style={styles.authBtnText}>{authLoading ? '...' : (isLogin ? 'Login' : 'Sign Up')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={()=>setIsLogin(!isLogin)}><Text style={styles.authSwitch}>{isLogin ? "New? Sign Up" : "Have Account? Login"}</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MainApp({ user, selectedShop, setSelectedShop, onLogout }: {
  user: User; selectedShop: Shop | null; setSelectedShop: (v: Shop | null) => void; onLogout: () => Promise<void>;
}) {
  const [role] = useState<'customer' | 'shopkeeper'>(user?.role || 'customer');
  const [shops, setShops] = useState<Shop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [udhaar, setUdhaar] = useState<UdhaarEntry[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [debugMsg, setDebugMsg] = useState('Initializing...');
  const [activeTab, setActiveTab] = useState(role==='shopkeeper' ? 'inventory' : 'shops');
  const [addItemModal, setAddItemModal] = useState(false);
  const [newItem, setNewItem] = useState({name:'', price:'', stock:''});
  const [orderModal, setOrderModal] = useState<Product | null>(null);
  const [custName, setCustName] = useState('');
  const [qty, setQty] = useState('1');
  const [udhaarModal, setUdhaarModal] = useState<UdhaarModalState>(null);

  // ✅ CRITICAL: For shopkeepers, shop_id = user.id. For customers, shop_id = selectedShop.id
  const shopId = role === 'shopkeeper' ? user?.id : (selectedShop?.id || null);

  const fetchData = async () => {
    if (!shopId) {
      setLoading(false);
      setDebugMsg('✅ Customer mode: showing shop list');
      return;
    }

    setLoading(true);
    setDebugMsg(`🌐 Fetching data for shop_id=${shopId}...`);
    console.log(`🌐 Fetching from ${API_URL}/api/inventory?shop_id=${shopId}`);
    
    try {
      const fetchPromise = fetch(`${API_URL}/api/inventory?shop_id=${shopId}`);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Server timeout (12s)')), 12000));
      const res = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Product[];
      console.log(`✅ Loaded ${data.length} items`);
      setProducts(data);
      setDebugMsg(`✅ Loaded ${data.length} items`);

      // Fetch other tabs in background
      Promise.all([
        fetch(`${API_URL}/api/orders?shop_id=${shopId}`).then(r=>r.json()),
        fetch(`${API_URL}/api/customers?shop_id=${shopId}`).then(r=>r.json()),
        fetch(`${API_URL}/api/alerts?shop_id=${shopId}`).then(r=>r.json())
      ]).then(([o,u,a]) => { 
        setOrders(o as Order[]); 
        setUdhaar(u as UdhaarEntry[]); 
        setAlerts(a as AlertItem[]); 
        console.log('✅ Fetched orders, udhaar, alerts');
      });
    } catch (err: any) {
      console.log('❌ Fetch error:', err.message);
      setDebugMsg(`❌ ${err.message}. Tap Refresh.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if(role==='customer' && !selectedShop) {
      setLoading(true);
      setDebugMsg('🌐 Fetching shops list...');
      fetch(`${API_URL}/api/shops`)
        .then(r=>r.json())
        .then(data => {
          console.log('✅ Shops:', data);
          setShops(data as Shop[]);
        })
        .catch(e => console.log('❌ Fetch shops error:', e.message))
        .finally(()=>setLoading(false));
    } else if(shopId) { 
      fetchData(); 
    }
  }, [shopId, role, selectedShop]);

  const addItem = async () => {
    if(!newItem.name || !newItem.price || !newItem.stock) return Alert.alert('Error', 'Fill all fields');
    if(!shopId) return Alert.alert('Error', 'Shop ID missing');
    
    try {
      console.log(`➕ Adding item: shop_id=${shopId}, name=${newItem.name}`);
      const res = await fetch(`${API_URL}/api/inventory/add?shop_id=${shopId}&name=${encodeURIComponent(newItem.name)}&price=${newItem.price}&stock=${newItem.stock}`, {method:'POST'});
      const data = await res.json();
      console.log('➕ Add item response:', data);
      
      if(data.error) throw new Error(data.error);
      Alert.alert('✅ Added', `${newItem.name} added to your shop!`);
      setAddItemModal(false); setNewItem({name:'',price:'',stock:''}); fetchData();
    } catch(e: any) { 
      console.log('❌ Add item error:', e.message);
      Alert.alert('Error', e.message || 'Failed to add item'); 
    }
  };

  const placeOrder = async () => {
    if(!custName.trim() || !orderModal) return Alert.alert('Error', 'Enter name');
    if(!shopId) return Alert.alert('Error', 'Shop ID missing');
    
    try {
      console.log(`🛒 Placing order: shop_id=${shopId}, item_id=${orderModal.id}`);
      const res = await fetch(`${API_URL}/api/orders?shop_id=${shopId}&item_id=${orderModal.id}&customer_name=${encodeURIComponent(custName)}&quantity=${qty}`, {method:'POST'});
      const data = await res.json();
      console.log('🛒 Order response:', data);
      
      if(data.error) return Alert.alert('Failed', data.error);
      Alert.alert('Success', `Ordered ${qty}x ${orderModal.name}`);
      setOrderModal(null); setCustName(''); setQty('1'); fetchData();
    } catch(e: any) { 
      console.log('❌ Order error:', e.message);
      Alert.alert('Error', e.message || 'Connection failed'); 
    }
  };

  const recordUdhaar = async () => {
    if(!udhaarModal) return;
    const name = udhaarModal.customer_name.trim();
    const amount = udhaarModal.amount;
    if(!name || !amount) return Alert.alert('Error', 'Name & Amount required');
    if(!shopId) return Alert.alert('Error', 'Shop ID missing');
    
    try {
      console.log(`📒 Recording udhaar: shop_id=${shopId}, customer=${name}`);
      const res = await fetch(`${API_URL}/api/udhaar?shop_id=${shopId}&customer_name=${encodeURIComponent(name)}&amount=${amount}&type=${udhaarModal.type}&note=${encodeURIComponent(udhaarModal.note||'')}`, {method:'POST'});
      const data = await res.json();
      console.log('📒 Udhaar response:', data);
      
      if(data.error) throw new Error(data.error);
      Alert.alert('✅ Recorded', `${udhaarModal.type} saved`);
      setUdhaarModal(null); fetchData();
    } catch(e: any) { 
      console.log('❌ Udhaar error:', e.message);
      Alert.alert('Failed', e.message || 'Error'); 
    }
  };

  // ==================== RENDER HELPERS ====================
  const renderShopItem = ({item}: {item: Shop}) => (
    <TouchableOpacity style={styles.shopCard} onPress={()=>{setSelectedShop(item); setActiveTab('inventory');}}>
      <Text style={styles.shopName}>{item.shop_name || item.name}</Text>
      <Text style={styles.shopSub}>Tap to view items</Text>
    </TouchableOpacity>
  );

  const renderProductItem = ({item}: {item: Product}) => (
    <TouchableOpacity style={[styles.card, item.stock===0 && styles.disabled]} onPress={()=> role==='customer' && item.stock>0 ? setOrderModal(item) : setOrderModal(item)}>
      <View style={styles.prodInfo}><Text style={styles.prodName}>{item.name}</Text><Text style={styles.prodPrice}>₹{item.price}</Text></View>
      <Text style={[styles.badge, item.stock>5?styles.in:item.stock>0?styles.low:styles.out]}>{item.stock>0 ? `${item.stock} Left` : '❌ Out'}</Text>
    </TouchableOpacity>
  );

  const renderOrderItem = ({item}: {item: Order}) => (
    <View style={styles.orderCard}><Text style={styles.orderText}>{item.customer_name} ordered {item.quantity}x {products.find(p=>p.id===item.item_id)?.name || 'Item'}</Text></View>
  );

  const renderUdhaarItem = ({item}: {item: UdhaarEntry}) => (
    <View style={styles.ledgerCard}><Text style={styles.custName}>{item.customer_name}</Text><Text style={[styles.balance, item.balance>0?styles.overdue:styles.ok]}>₹{item.balance}</Text></View>
  );

  const renderAlertItem = ({item}: {item: AlertItem}) => (
    <View style={[styles.alertCard, item.priority==='high' && styles.alertHigh]}><Text style={styles.alertIcon}>📈</Text><Text style={styles.alertMessage}>{item.message}</Text></View>
  );

  // ==================== CUSTOMER SHOP LIST ====================
  if(role==='customer' && !selectedShop) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <Text style={styles.title}>🛍️ Choose a Shop</Text>
          <TouchableOpacity onPress={onLogout}><Text style={{color:'#fff', fontSize:14}}>🚪 Logout</Text></TouchableOpacity>
        </View>
        <Text style={{textAlign:'center', padding:10, color:'#666'}}>{debugMsg}</Text>
        <FlatList data={shops} keyExtractor={i=>i.id.toString()} contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={{textAlign:'center',color:'#888',marginTop:30}}>No shops yet. Ask shopkeepers to sign up!</Text>}
          renderItem={renderShopItem} />
      </SafeAreaView>
    );
  }

  // ==================== LOADING / ERROR STATE ====================
  if(loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#2E7D32" />
      <Text style={{marginTop:12, color:'#333', fontWeight:'500'}}>{debugMsg}</Text>
      <TouchableOpacity style={{marginTop:15, padding:10, backgroundColor:'#eee', borderRadius:8}} onPress={()=>{setLoading(false); setDebugMsg('Stopped loading');}}>
        <Text style={{color:'#333'}}>⏹️ Stop Loading & See UI</Text>
      </TouchableOpacity>
    </View>
  );

  // ==================== MAIN DASHBOARD ====================
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={{backgroundColor:'#f0f4f8', padding:8, alignItems:'center'}}>
        <Text style={{fontSize:11, color:'#666'}}>{debugMsg}</Text>
        <TouchableOpacity onPress={fetchData} style={{marginTop:4, padding:6, backgroundColor:'#e0e7ff', borderRadius:6}}>
          <Text style={{fontSize:12, color:'#1565C0'}}>🔄 Refresh Data</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>🛒 KOTTU</Text>
          {role==='shopkeeper' ? <Text style={{color:'#fff', fontSize:14}}>{user?.shop_name}</Text> : 
           <TouchableOpacity onPress={()=>setSelectedShop(null)}><Text style={{color:'#fff', fontSize:12}}>← Back to Shops</Text></TouchableOpacity>}
        </View>
        <TouchableOpacity onPress={onLogout}><Text style={{color:'#fff', fontSize:12, marginTop:4}}>🚪 Logout</Text></TouchableOpacity>
      </View>

      {role==='shopkeeper' && (
        <TouchableOpacity style={styles.addBtn} onPress={()=>setAddItemModal(true)}>
          <Text style={{color:'#fff', fontWeight:'bold'}}>➕ Add New Item</Text>
        </TouchableOpacity>
      )}

      <View style={styles.tabs}>
        {role==='shopkeeper' ? ['inventory','orders','udhaar','alerts'].map(tab=>(
          <TouchableOpacity key={tab} style={[styles.tab, activeTab===tab && styles.activeTab]} onPress={()=>setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab===tab && styles.activeTabText]}>
              {tab==='inventory'?'📦':tab==='orders'?'🧾':tab==='udhaar'?'📒':'🔔'} {tab.charAt(0).toUpperCase()+tab.slice(1)}
            </Text>
          </TouchableOpacity>
        )) : (
          <View style={{flex:1, alignItems:'center'}}><Text style={{color:'#fff', fontWeight:'bold'}}>📦 {selectedShop?.shop_name || 'Shop'}</Text></View>
        )}
      </View>

      <View style={{flex:1}}>
        {activeTab==='inventory' && <FlatList data={products} keyExtractor={i=>i.id.toString()} contentContainerStyle={styles.list} renderItem={renderProductItem} />}
        {activeTab==='orders' && <FlatList data={orders} keyExtractor={i=>i.id.toString()} contentContainerStyle={styles.list} ListEmptyComponent={<Text style={{textAlign:'center',color:'#888',marginTop:20}}>No orders</Text>} renderItem={renderOrderItem} />}
        {activeTab==='udhaar' && <FlatList data={udhaar} keyExtractor={(item, index) => index.toString()} contentContainerStyle={styles.list} ListEmptyComponent={<Text style={{textAlign:'center',color:'#888',marginTop:20}}>No udhaar</Text>} renderItem={renderUdhaarItem} />}
        {activeTab==='alerts' && (alerts.length===0 ? <View style={styles.emptyAlerts}><Text style={styles.emptyIcon}>✅</Text><Text style={styles.emptyText}>All good!</Text></View> : <FlatList data={alerts} keyExtractor={(i,idx)=>idx.toString()} contentContainerStyle={styles.list} renderItem={renderAlertItem} />)}
      </View>

      {/* ==================== MODALS ==================== */}
      <Modal visible={addItemModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}><Text style={styles.modalTitle}>➕ Add Item</Text>
          <TextInput style={styles.input} placeholder="Item Name" value={newItem.name} onChangeText={v=>setNewItem({...newItem, name:v})}/>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Price (₹)" value={newItem.price} onChangeText={v=>setNewItem({...newItem, price:v})}/>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Stock" value={newItem.stock} onChangeText={v=>setNewItem({...newItem, stock:v})}/>
          <View style={styles.modalBtns}><TouchableOpacity style={styles.cancel} onPress={()=>setAddItemModal(false)}><Text style={styles.btnTxt}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.confirm} onPress={addItem}><Text style={[styles.btnTxt,{color:'#fff'}]}>Add</Text></TouchableOpacity></View>
        </View></View>
      </Modal>

      <Modal visible={!!orderModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}><Text style={styles.modalTitle}>Place Order</Text>
          <Text style={{marginBottom:10}}>{orderModal?.name} - ₹{orderModal?.price}</Text>
          <TextInput style={styles.input} placeholder="Your Name" value={custName} onChangeText={setCustName}/>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Qty" value={qty} onChangeText={setQty}/>
          <View style={styles.modalBtns}><TouchableOpacity style={styles.cancel} onPress={()=>setOrderModal(null)}><Text style={styles.btnTxt}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.confirm} onPress={placeOrder}><Text style={[styles.btnTxt,{color:'#fff'}]}>Order</Text></TouchableOpacity></View>
        </View></View>
      </Modal>

      <Modal visible={!!udhaarModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}><Text style={styles.modalTitle}>📒 Record Udhaar</Text>
          <TextInput style={styles.input} placeholder="Customer Name" value={udhaarModal?.customer_name || ''} onChangeText={v => setUdhaarModal(p => p ? { ...p, customer_name: v } : { customer_name: v, amount: 0, type: 'credit', note: '' })} />
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Amount" value={udhaarModal?.amount?.toString() || ''} onChangeText={v => setUdhaarModal(p => p ? { ...p, amount: parseInt(v) || 0 } : { customer_name: '', amount: parseInt(v) || 0, type: 'credit', note: '' })} />
          <View style={styles.typeToggle}>
            <TouchableOpacity style={[styles.typeBtn, udhaarModal?.type === 'credit' && styles.active]} onPress={() => setUdhaarModal(p => p ? { ...p, type: 'credit' } : { customer_name: '', amount: 0, type: 'credit', note: '' })}><Text style={styles.typeTxt}>➕ Credit</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.typeBtn, udhaarModal?.type === 'payment' && styles.active]} onPress={() => setUdhaarModal(p => p ? { ...p, type: 'payment' } : { customer_name: '', amount: 0, type: 'payment', note: '' })}><Text style={styles.typeTxt}>➖ Payment</Text></TouchableOpacity>
          </View>
          <View style={styles.modalBtns}><TouchableOpacity style={styles.cancel} onPress={()=>{setUdhaarModal(null); setDebugMsg('Initializing...');}}><Text style={styles.btnTxt}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.confirm} onPress={recordUdhaar}><Text style={[styles.btnTxt,{color:'#fff'}]}>Save</Text></TouchableOpacity></View>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
  container:{flex:1, backgroundColor:'#f8f9fa'}, header:{padding:16, backgroundColor:'#2E7D32', borderBottomLeftRadius:16, borderBottomRightRadius:16},
  headerTop:{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}, title:{fontSize:24, fontWeight:'bold', color:'#fff'},
  tabs:{flexDirection:'row', backgroundColor:'#fff', padding:8, borderBottomWidth:1, borderBottomColor:'#eee'},
  tab:{flex:1, padding:10, alignItems:'center', borderRadius:8, marginHorizontal:2}, activeTab:{backgroundColor:'#2E7D32'}, tabText:{fontSize:12, color:'#666'}, activeTabText:{color:'#fff', fontWeight:'600'},
  list:{padding:12, paddingBottom:80},
  shopCard:{backgroundColor:'white', padding:16, borderRadius:12, marginBottom:10, elevation:2}, shopName:{fontSize:18, fontWeight:'bold', color:'#333'}, shopSub:{fontSize:13, color:'#888', marginTop:4},
  addBtn:{margin:12, padding:12, backgroundColor:'#4A90E2', borderRadius:10, alignItems:'center'},
  card:{backgroundColor:'white', padding:14, borderRadius:12, marginBottom:10, flexDirection:'row', justifyContent:'space-between', alignItems:'center', elevation:2}, disabled:{opacity:0.5}, prodInfo:{flex:1}, prodName:{fontSize:16, fontWeight:'600', color:'#333'}, prodPrice:{fontSize:15, color:'#2E7D32', fontWeight:'bold', marginTop:2},
  badge:{paddingHorizontal:10, paddingVertical:4, borderRadius:12, fontSize:12, fontWeight:'600'}, in:{backgroundColor:'#E8F5E9', color:'#2E7D32'}, low:{backgroundColor:'#FFF3E0', color:'#E65100'}, out:{backgroundColor:'#FFEBEE', color:'#C62828'},
  orderCard:{backgroundColor:'#f0f4f8', padding:12, borderRadius:10, marginBottom:8, flexDirection:'row', justifyContent:'space-between'}, orderText:{fontSize:14, color:'#333', flex:1},
  ledgerCard:{backgroundColor:'white', padding:14, borderRadius:12, marginBottom:10, flexDirection:'row', justifyContent:'space-between', alignItems:'center', elevation:1}, custName:{fontSize:16, fontWeight:'600', color:'#333'}, balance:{fontSize:15, fontWeight:'bold'}, ok:{color:'#2E7D32'}, overdue:{color:'#C62828'},
  emptyAlerts:{padding:30, alignItems:'center', backgroundColor:'#f8f9fa', borderRadius:12, margin:12}, emptyIcon:{fontSize:40, marginBottom:10}, emptyText:{fontSize:16, fontWeight:'600', color:'#333', marginBottom:4},
  alertCard:{backgroundColor:'white', padding:14, borderRadius:12, marginBottom:10, flexDirection:'row', alignItems:'center', elevation:2, borderLeftWidth:4, borderLeftColor:'#2E7D32'}, alertHigh:{borderLeftColor:'#C62828', backgroundColor:'#FFEBEE'}, alertIcon:{fontSize:20, marginRight:10}, alertMessage:{fontSize:14, color:'#333', fontWeight:'500'},
  modalOverlay:{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center'}, modalContent:{width:'90%', backgroundColor:'white', borderRadius:14, padding:18, maxHeight:'80%'}, modalTitle:{fontSize:17, fontWeight:'bold', marginBottom:12, color:'#333'},
  input:{borderWidth:1, borderColor:'#ccc', borderRadius:8, padding:10, fontSize:15, marginBottom:10, backgroundColor:'#fafafa'},
  typeToggle:{flexDirection:'row', gap:10, marginBottom:10}, typeBtn:{flex:1, padding:10, borderRadius:8, backgroundColor:'#eee', alignItems:'center'}, active:{backgroundColor:'#2E7D32'}, typeTxt:{fontWeight:'600', color:'#333'},
  modalBtns:{flexDirection:'row', justifyContent:'flex-end', gap:8}, cancel:{padding:10, backgroundColor:'#eee', borderRadius:8}, confirm:{padding:10, backgroundColor:'#2E7D32', borderRadius:8}, btnTxt:{fontSize:14, fontWeight:'600', color:'#333'},
  center:{flex:1, justifyContent:'center', alignItems:'center'},
  authContainer:{flex:1, backgroundColor:'#f0f4f8', justifyContent:'center'}, authBox:{margin:20, backgroundColor:'#fff', borderRadius:16, padding:24, elevation:4},
  authTitle:{fontSize:28, fontWeight:'bold', textAlign:'center', color:'#2E7D32'}, authSub:{fontSize:14, textAlign:'center', color:'#666', marginBottom:20}, authToggle:{fontSize:16, fontWeight:'600', marginBottom:16, color:'#333'},
  authInput:{borderWidth:1, borderColor:'#ccc', borderRadius:8, padding:12, marginBottom:12, fontSize:15}, roleBox:{flexDirection:'row', gap:10, marginBottom:12},
  roleBtn:{flex:1, padding:10, borderRadius:8, backgroundColor:'#eee', alignItems:'center'}, roleActive:{backgroundColor:'#2E7D32'}, roleTxt:{fontWeight:'600', color:'#333'},
  authBtn:{backgroundColor:'#2E7D32', padding:14, borderRadius:8, alignItems:'center', marginTop:8}, authBtnText:{color:'#fff', fontSize:16, fontWeight:'bold'},
  authSwitch:{textAlign:'center', marginTop:16, color:'#1565C0', fontWeight:'500'}
});
