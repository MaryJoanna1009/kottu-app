// frontend/app/(tabs)/index.tsx
import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, FlatList, TouchableOpacity, 
  ActivityIndicator, Alert, SafeAreaView, StatusBar, TextInput, Modal, 
  KeyboardAvoidingView, Platform, ScrollView 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://kottu-backend.onrender.com';

type User = { id: number; name: string; phone: string; role: 'customer' | 'shopkeeper'; shop_name: string; address: string; token?: string } | null;
type Shop = { id: number; name: string; shop_name: string; address: string };
type Category = { id: number; name: string };
type Product = { id: number; name: string; price: number; stock: number; category_id?: number };
type Order = { id: number; item_id: number; customer_name: string; customer_phone: string; quantity: number; status: string; created_at: string; item_name?: string };
type ProfileData = { name: string; phone: string; address: string; name_detail?: string };

export default function App() {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', phone: '', password: '', role: 'customer' as 'customer' | 'shopkeeper', shop_name: '', address: '' });
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
    } catch(e: any) {}
    finally { setLoading(false); }
  };

  const handleAuth = async () => {
    const { name, phone, password, role, shop_name, address } = formData;
    if(!phone || password.length < 4) return Alert.alert('Error', 'Phone & Password (min 4) required');
    if(!isLogin && !name) return Alert.alert('Error', 'Name required');

    setAuthLoading(true);
    try {
      const endpoint = isLogin ? 'login' : 'register';
      const body: any = { phone, password };
      if(!isLogin) { body.name = name; body.role = role; body.shop_name = role === 'shopkeeper' ? shop_name : ''; body.address = address; }

      const res = await fetch(`${API_URL}/api/auth/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const data = await res.json();
      if(data.error) throw new Error(data.error);
      
      const userData: User = { 
        id: data.user_id || data.id, 
        name: data.name, 
        phone, 
        role: data.role || role, 
        shop_name: data.shop_name || shop_name,
        address: data.address || address,
        token: data.token 
      };
      await AsyncStorage.setItem('kottu_user', JSON.stringify(userData));
      setUser(userData);
      if(data.role === 'customer') setSelectedShop(null);
      Alert.alert('Welcome', `Logged in as ${userData.name}`);
    } catch(e: any) { 
      Alert.alert('Failed', e.message || 'Unknown error'); 
    }
    finally { setAuthLoading(false); }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('kottu_user');
    await AsyncStorage.removeItem('kottu_selected_shop');
    setUser(null); setSelectedShop(null);
    setFormData({ name: '', phone: '', password: '', role: 'customer', shop_name: '', address: '' });
  };

  if(loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2E7D32" /><Text style={{marginTop:10, color:'#666'}}>Connecting...</Text></View>;
  if(!user) return <AuthScreen isLogin={isLogin} setIsLogin={setIsLogin} formData={formData} setFormData={setFormData} handleAuth={handleAuth} authLoading={authLoading} />;

  return <MainApp user={user} selectedShop={selectedShop} setSelectedShop={setSelectedShop} onLogout={logout} />;
}

// ==================== AUTH SCREEN ====================
function AuthScreen({ isLogin, setIsLogin, formData, setFormData, handleAuth, authLoading }: {
  isLogin: boolean; setIsLogin: (v: boolean) => void;
  formData: { name: string; phone: string; password: string; role: 'customer' | 'shopkeeper'; shop_name: string; address: string };
  setFormData: (v: any) => void; handleAuth: () => Promise<void>; authLoading: boolean;
}) {
  return (
    <SafeAreaView style={styles.authContainer}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex:1}}>
        <View style={styles.authBox}>
          <Text style={styles.authTitle}>🛒 KOTTU</Text>
          <Text style={styles.authSub}>Multi-Shop Platform</Text>
          <Text style={styles.authToggle}>{isLogin ? 'Login' : 'Create Account'}</Text>
          {!isLogin && <TextInput style={styles.authInput} placeholder="Full Name" value={formData.name} onChangeText={v=>setFormData({...formData, name:v})} />}
          <TextInput style={styles.authInput} placeholder="Phone Number" keyboardType="phone-pad" value={formData.phone} onChangeText={v=>setFormData({...formData, phone:v})} />
          <TextInput style={styles.authInput} placeholder="Password (min 4)" secureTextEntry value={formData.password} onChangeText={v=>setFormData({...formData, password:v})} />
          {!isLogin && (
            <>
              <View style={styles.roleBox}>
                <TouchableOpacity style={[styles.roleBtn, formData.role==='customer' && styles.roleActive]} onPress={()=>setFormData({...formData, role:'customer'})}><Text style={styles.roleTxt}>🛍️ Customer</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.roleBtn, formData.role==='shopkeeper' && styles.roleActive]} onPress={()=>setFormData({...formData, role:'shopkeeper'})}><Text style={styles.roleTxt}>🏪 Shopkeeper</Text></TouchableOpacity>
              </View>
              {formData.role==='shopkeeper' && <TextInput style={styles.authInput} placeholder="Shop Name" value={formData.shop_name} onChangeText={v=>setFormData({...formData, shop_name:v})} />}
              <TextInput style={styles.authInput} placeholder="Address (Optional)" value={formData.address} onChangeText={v=>setFormData({...formData, address:v})} />
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

// ==================== MAIN APP ====================
function MainApp({ user, selectedShop, setSelectedShop, onLogout }: {
  user: User; selectedShop: Shop | null; setSelectedShop: (v: Shop | null) => void; onLogout: () => Promise<void>;
}) {
  const [role] = useState<'customer' | 'shopkeeper'>(user?.role || 'customer');
  const [shops, setShops] = useState<Shop[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [shopStats, setShopStats] = useState({ total_orders: 0, recent_orders: [] as Order[] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(role==='shopkeeper' ? 'inventory' : 'shops');
  
  // Modals & Forms
  const [catModal, setCatModal] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [itemModal, setItemModal] = useState(false);
  const [newItem, setNewItem] = useState({name:'', price:'', stock:'', category_id:''});
  const [orderModal, setOrderModal] = useState<Product | null>(null);
  const [custName, setCustName] = useState('');
  const [qty, setQty] = useState('1');
  const [editProfile, setEditProfile] = useState(false);
  const [profForm, setProfForm] = useState({name:'', phone:'', address:''});

  const shopId = role === 'shopkeeper' ? user?.id : (selectedShop?.id || null);

  const fetchData = async () => {
    if (!shopId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [pRes, catRes] = await Promise.all([
        fetch(`${API_URL}/api/inventory?shop_id=${shopId}`).then(r=>r.json()),
        fetch(`${API_URL}/api/categories?shop_id=${shopId}`).then(r=>r.json())
      ]);
      setProducts(pRes as Product[]);
      setCategories(catRes as Category[]);
      
      if(role === 'shopkeeper') {
        const [statsRes, ordRes] = await Promise.all([
          fetch(`${API_URL}/api/profile?user_id=${user?.id}&role=shopkeeper`).then(r=>r.json()),
          fetch(`${API_URL}/api/orders?shop_id=${shopId}`).then(r=>r.json())
        ]);
        setShopStats(statsRes);
        setOrders(ordRes as Order[]);
        setProfile(statsRes.profile);
      } else {
        const profRes = await fetch(`${API_URL}/api/profile?user_id=${user?.id}&role=customer`).then(r=>r.json());
        setProfile(profRes.profile);
        const custOrdRes = await fetch(`${API_URL}/api/customer/orders?customer_phone=${user?.phone}`).then(r=>r.json());
        setCustomerOrders(custOrdRes as Order[]);
      }
    } catch(e: any) { console.log('Fetch error:', e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if(role==='customer' && !selectedShop) {
      setLoading(true);
      fetch(`${API_URL}/api/shops`).then(r=>r.json()).then(setShops).finally(()=>setLoading(false));
    } else if(shopId) { fetchData(); }
  }, [shopId, role, selectedShop]);

  const addCategory = async () => {
    if(!newCat.trim() || !shopId) return Alert.alert('Error', 'Enter category name');
    try {
      await fetch(`${API_URL}/api/categories?shop_id=${shopId}&name=${encodeURIComponent(newCat)}`, {method:'POST'});
      setCatModal(false); setNewCat(''); fetchData();
    } catch(e: any) { Alert.alert('Error', e.message); }
  };

  const addItem = async () => {
    if(!newItem.name || !newItem.price || !newItem.stock || !shopId) return Alert.alert('Error', 'Fill all fields');
    try {
      const catId = newItem.category_id ? parseInt(newItem.category_id) : null;
      await fetch(`${API_URL}/api/inventory/add?shop_id=${shopId}&name=${encodeURIComponent(newItem.name)}&price=${newItem.price}&stock=${newItem.stock}&category_id=${catId || ''}`, {method:'POST'});
      setItemModal(false); setNewItem({name:'', price:'', stock:'', category_id:''}); fetchData();
    } catch(e: any) { Alert.alert('Error', e.message); }
  };

  const placeOrder = async () => {
    if(!custName.trim() || !orderModal || !shopId) return Alert.alert('Error', 'Enter name');
    try {
      const res = await fetch(`${API_URL}/api/orders?shop_id=${shopId}&item_id=${orderModal.id}&customer_name=${encodeURIComponent(custName)}&customer_phone=${user?.phone || ''}&quantity=${qty}`, {method:'POST'});
      const data = await res.json();
      if(data.error) return Alert.alert('Failed', data.error);
      Alert.alert('Success', `Ordered ${qty}x ${orderModal.name}`);
      setOrderModal(null); setCustName(''); setQty('1'); fetchData();
    } catch(e: any) { Alert.alert('Error', e.message); }
  };

  const updateProfile = async () => {
    try {
      await fetch(`${API_URL}/api/profile/update?user_id=${user?.id}&name=${encodeURIComponent(profForm.name)}&phone=${profForm.phone}&address=${encodeURIComponent(profForm.address)}`, {method:'POST'});
      setEditProfile(false); fetchData();
    } catch(e: any) { Alert.alert('Error', e.message); }
  };

  // Group products by category
  const groupedProducts = categories.map(cat => ({
    category: cat.name,
    items: products.filter(p => p.category_id === cat.id)
  }));

  // ==================== RENDER HELPERS ====================
  const renderShopItem = ({item}: {item: Shop}) => (
    <TouchableOpacity style={styles.card} onPress={()=>{setSelectedShop(item); setActiveTab('inventory');}}>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{item.shop_name || item.name}</Text>
        <Text style={styles.cardSub}>{item.address || 'No address provided'}</Text>
      </View>
      <Text style={styles.badge}>Tap to View</Text>
    </TouchableOpacity>
  );

  const renderOrderItem = ({item}: {item: Order}) => (
    <View style={styles.orderRow}>
      <View style={styles.orderInfo}>
        <Text style={styles.orderText}>{item.customer_name} • {item.item_name || 'Item'}</Text>
        <Text style={styles.orderSub}>{item.quantity}x • {new Date(item.created_at).toLocaleDateString()}</Text>
      </View>
      <Text style={styles.orderStatus}>{item.status}</Text>
    </View>
  );

  // ==================== CUSTOMER SHOP LIST ====================
  if(role==='customer' && !selectedShop) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🛍️ Nearby Shops</Text>
          <TouchableOpacity onPress={onLogout}><Text style={styles.logoutBtn}>🚪 Logout</Text></TouchableOpacity>
        </View>
        <FlatList data={shops} keyExtractor={i=>i.id.toString()} contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No shops registered yet.</Text>}
          renderItem={renderShopItem} />
      </SafeAreaView>
    );
  }

  if(loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2E7D32" /><Text style={{marginTop:10}}>Loading...</Text></View>;

  // ==================== MAIN DASHBOARD ====================
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>🛒 KOTTU</Text>
          {role==='shopkeeper' ? <Text style={styles.shopName}>{user?.shop_name}</Text> : 
           <TouchableOpacity onPress={()=>setSelectedShop(null)}><Text style={styles.backBtn}>← Shops</Text></TouchableOpacity>}
        </View>
        <TouchableOpacity onPress={()=>setActiveTab('profile')}><Text style={styles.profileBtn}>👤 Profile</Text></TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {role==='shopkeeper' ? ['inventory','orders'].map(tab=>(
          <TouchableOpacity key={tab} style={[styles.tab, activeTab===tab && styles.activeTab]} onPress={()=>setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab===tab && styles.activeTabText]}>{tab==='inventory'?'📦 Inventory':'🧾 Orders'}</Text>
          </TouchableOpacity>
        )) : ['shops','orders'].map(tab=>(
          <TouchableOpacity key={tab} style={[styles.tab, activeTab===tab && styles.activeTab]} onPress={()=>setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab===tab && styles.activeTabText]}>{tab==='shops'?'🏪 Shops':'📜 My Orders'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{flex:1, backgroundColor:'#F8F9FA'}} contentContainerStyle={{padding:12, paddingBottom:80}}>
        {activeTab==='profile' && (
          <View style={styles.profileCard}>
            <Text style={styles.profileTitle}>👤 Profile</Text>
            <View style={styles.profileField}><Text style={styles.label}>Name</Text><Text style={styles.value}>{profile?.name || user?.name}</Text></View>
            <View style={styles.profileField}><Text style={styles.label}>Phone</Text><Text style={styles.value}>{profile?.phone || user?.phone}</Text></View>
            <View style={styles.profileField}><Text style={styles.label}>Address</Text><Text style={styles.value}>{profile?.address || 'Not set'}</Text></View>
            {role==='shopkeeper' && (
              <>
                <View style={styles.profileField}><Text style={styles.label}>Total Orders</Text><Text style={styles.value}>{shopStats.total_orders}</Text></View>
                <Text style={styles.sectionTitle}>Recent Orders</Text>
                {shopStats.recent_orders.map((o: Order) => (
                  <View key={o.id} style={styles.miniOrder}><Text>{o.customer_name} • {o.quantity}x</Text><Text style={{color:'#666'}}>{new Date(o.created_at).toLocaleDateString()}</Text></View>
                ))}
              </>
            )}
            {role==='customer' && (
              <>
                <Text style={styles.sectionTitle}>Order History</Text>
                {customerOrders.map((o: Order) => (
                  <View key={o.id} style={styles.miniOrder}><Text>{o.item_name} • {o.quantity}x</Text><Text style={{color:'#666'}}>{o.status}</Text></View>
                ))}
              </>
            )}
            <TouchableOpacity style={styles.editBtn} onPress={()=>{setEditProfile(true); setProfForm({name: profile?.name||'', phone: profile?.phone||'', address: profile?.address||''});}}>
              <Text style={{color:'#fff', fontWeight:'bold'}}>✏️ Edit Profile</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab==='inventory' && role==='shopkeeper' && (
          <View>
            <TouchableOpacity style={styles.addBtn} onPress={()=>setCatModal(true)}><Text style={{color:'#fff', fontWeight:'bold'}}>➕ Add Category</Text></TouchableOpacity>
            {groupedProducts.length === 0 ? (
              <Text style={styles.emptyText}>No categories or items yet.</Text>
            ) : (
              groupedProducts.map((group, idx) => (
                <View key={idx}>
                  <View style={styles.catHeader}>
                    <Text style={styles.catTitle}>{group.category}</Text>
                    <TouchableOpacity onPress={()=>{
                      setItemModal(true);
                      const cat = categories.find(c => c.name === group.category);
                      setNewItem(prev => ({...prev, category_id: cat ? String(cat.id) : ''}));
                    }}><Text style={styles.addItemLink}>+ Add Item</Text></TouchableOpacity>
                  </View>
                  {group.items.map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemPrice}>₹{item.price} • {item.stock} left</Text>
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        )}

        {activeTab==='inventory' && role==='customer' && selectedShop && (
          <View>
            {groupedProducts.length === 0 ? (
              <Text style={styles.emptyText}>This shop hasn't added categories yet.</Text>
            ) : (
              groupedProducts.map((group, idx) => (
                <View key={idx}>
                  <Text style={styles.sectionTitle}>{group.category}</Text>
                  {group.items.map((item) => (
                    <TouchableOpacity key={item.id} style={styles.itemRow} onPress={()=> item.stock>0 ? setOrderModal(item) : null}>
                      <View style={styles.itemInfo}><Text style={styles.itemName}>{item.name}</Text><Text style={styles.itemPrice}>₹{item.price}</Text></View>
                      <Text style={[styles.stockBadge, item.stock>5?styles.stockOk:item.stock>0?styles.stockLow:styles.stockOut]}>
                        {item.stock>0 ? `${item.stock} Left` : '❌ Out'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))
            )}
          </View>
        )}

        {activeTab==='orders' && (
          <View>
            <FlatList data={role==='shopkeeper' ? orders : customerOrders} keyExtractor={i=>i.id.toString()} scrollEnabled={false}
              ListEmptyComponent={<Text style={styles.emptyText}>No orders yet.</Text>}
              renderItem={renderOrderItem} />
          </View>
        )}
      </ScrollView>

      {/* ==================== MODALS ==================== */}
      <Modal visible={catModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}><Text style={styles.modalTitle}>➕ Add Category</Text>
          <TextInput style={styles.input} placeholder="Category Name (e.g., Vegetables)" value={newCat} onChangeText={setNewCat}/>
          <View style={styles.modalBtns}><TouchableOpacity style={styles.cancel} onPress={()=>setCatModal(false)}><Text style={styles.btnTxt}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.confirm} onPress={addCategory}><Text style={[styles.btnTxt,{color:'#fff'}]}>Add</Text></TouchableOpacity></View>
        </View></View>
      </Modal>

      <Modal visible={itemModal} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}><Text style={styles.modalTitle}>➕ Add Item</Text>
          <TextInput style={styles.input} placeholder="Item Name" value={newItem.name} onChangeText={v=>setNewItem({...newItem, name:v})}/>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Price (₹)" value={newItem.price} onChangeText={v=>setNewItem({...newItem, price:v})}/>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Stock" value={newItem.stock} onChangeText={v=>setNewItem({...newItem, stock:v})}/>
          <View style={styles.modalBtns}><TouchableOpacity style={styles.cancel} onPress={()=>setItemModal(false)}><Text style={styles.btnTxt}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.confirm} onPress={addItem}><Text style={[styles.btnTxt,{color:'#fff'}]}>Add</Text></TouchableOpacity></View>
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

      <Modal visible={editProfile} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}><Text style={styles.modalTitle}>✏️ Edit Profile</Text>
          <TextInput style={styles.input} placeholder="Name" value={profForm.name} onChangeText={v=>setProfForm({...profForm, name:v})}/>
          <TextInput style={styles.input} placeholder="Phone" value={profForm.phone} onChangeText={v=>setProfForm({...profForm, phone:v})}/>
          <TextInput style={styles.input} placeholder="Address" value={profForm.address} onChangeText={v=>setProfForm({...profForm, address:v})}/>
          <View style={styles.modalBtns}><TouchableOpacity style={styles.cancel} onPress={()=>setEditProfile(false)}><Text style={styles.btnTxt}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.confirm} onPress={updateProfile}><Text style={[styles.btnTxt,{color:'#fff'}]}>Save</Text></TouchableOpacity></View>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
  container:{flex:1, backgroundColor:'#F8F9FA'}, 
  header:{padding:16, backgroundColor:'#2E7D32', borderBottomLeftRadius:16, borderBottomRightRadius:16},
  headerTop:{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}, 
  headerTitle:{fontSize:22, fontWeight:'bold', color:'#fff'},
  shopName:{fontSize:14, color:'#E8F5E9', fontWeight:'600'}, backBtn:{color:'#fff', fontSize:14}, profileBtn:{color:'#fff', fontSize:14}, logoutBtn:{color:'#fff', fontSize:14},
  tabs:{flexDirection:'row', backgroundColor:'#fff', padding:8, borderBottomWidth:1, borderBottomColor:'#EAECEF'},
  tab:{flex:1, padding:10, alignItems:'center', borderRadius:8, marginHorizontal:2}, 
  activeTab:{backgroundColor:'#E8F5E9'}, tabText:{fontSize:13, color:'#666'}, activeTabText:{color:'#2E7D32', fontWeight:'600'},
  list:{padding:12, paddingBottom:80},
  card:{backgroundColor:'#fff', padding:16, borderRadius:12, marginBottom:12, flexDirection:'row', justifyContent:'space-between', alignItems:'center', elevation:2, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:4},
  cardContent:{flex:1}, cardTitle:{fontSize:16, fontWeight:'600', color:'#111'}, cardSub:{fontSize:13, color:'#666', marginTop:2},
  badge:{backgroundColor:'#E8F5E9', color:'#2E7D32', paddingHorizontal:10, paddingVertical:4, borderRadius:12, fontSize:12, fontWeight:'600'},
  section:{marginBottom:20}, sectionTitle:{fontSize:17, fontWeight:'600', color:'#333', marginBottom:10, marginTop:4},
  itemRow:{backgroundColor:'#fff', padding:14, borderRadius:10, marginBottom:8, flexDirection:'row', justifyContent:'space-between', alignItems:'center', elevation:1},
  itemInfo:{flex:1}, itemName:{fontSize:15, fontWeight:'500', color:'#333'}, itemPrice:{fontSize:14, color:'#2E7D32', fontWeight:'600', marginTop:2},
  stockBadge:{paddingHorizontal:8, paddingVertical:3, borderRadius:8, fontSize:11, fontWeight:'600'}, stockOk:{backgroundColor:'#E8F5E9', color:'#2E7D32'}, stockLow:{backgroundColor:'#FFF3E0', color:'#E65100'}, stockOut:{backgroundColor:'#FFEBEE', color:'#C62828'},
  orderRow:{backgroundColor:'#fff', padding:14, borderRadius:10, marginBottom:8, flexDirection:'row', justifyContent:'space-between', alignItems:'center'},
  orderInfo:{flex:1}, orderText:{fontSize:14, fontWeight:'500', color:'#333'}, orderSub:{fontSize:12, color:'#666', marginTop:2}, orderStatus:{fontSize:12, color:'#2E7D32', fontWeight:'600'},
  profileCard:{backgroundColor:'#fff', padding:16, borderRadius:12, elevation:2}, profileTitle:{fontSize:18, fontWeight:'bold', color:'#333', marginBottom:12},
  profileField:{marginBottom:12}, label:{fontSize:12, color:'#666', marginBottom:2}, value:{fontSize:15, color:'#333', fontWeight:'500'},
  miniOrder:{padding:10, backgroundColor:'#F8F9FA', borderRadius:8, marginBottom:6, flexDirection:'row', justifyContent:'space-between'},
  editBtn:{marginTop:12, padding:12, backgroundColor:'#2E7D32', borderRadius:8, alignItems:'center'},
  addBtn:{margin:12, padding:12, backgroundColor:'#4A90E2', borderRadius:10, alignItems:'center'},
  catHeader:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8}, catTitle:{fontSize:16, fontWeight:'600', color:'#333'}, addItemLink:{color:'#4A90E2', fontSize:13, fontWeight:'600'},
  emptyText:{textAlign:'center', color:'#888', marginTop:20, fontSize:14},
  modalOverlay:{flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', alignItems:'center'}, 
  modalContent:{width:'88%', backgroundColor:'#fff', borderRadius:16, padding:18, maxHeight:'75%'},
  modalTitle:{fontSize:18, fontWeight:'bold', marginBottom:12, color:'#333'}, 
  input:{borderWidth:1, borderColor:'#E0E0E0', borderRadius:10, padding:12, fontSize:15, marginBottom:12, backgroundColor:'#FAFAFA'},
  modalBtns:{flexDirection:'row', justifyContent:'flex-end', gap:10}, 
  cancel:{padding:10, backgroundColor:'#F0F0F0', borderRadius:8}, 
  confirm:{padding:10, backgroundColor:'#2E7D32', borderRadius:8}, 
  btnTxt:{fontSize:14, fontWeight:'600', color:'#333'},
  center:{flex:1, justifyContent:'center', alignItems:'center'},
  authContainer:{flex:1, backgroundColor:'#F8F9FA', justifyContent:'center'},
  authBox:{margin:20, backgroundColor:'#fff', borderRadius:16, padding:24, elevation:3},
  authTitle:{fontSize:26, fontWeight:'bold', textAlign:'center', color:'#2E7D32'},
  authSub:{fontSize:13, textAlign:'center', color:'#666', marginBottom:16},
  authToggle:{fontSize:16, fontWeight:'600', marginBottom:14, color:'#333'},
  authInput:{borderWidth:1, borderColor:'#E0E0E0', borderRadius:10, padding:12, marginBottom:12, fontSize:15, backgroundColor:'#FAFAFA'},
  roleBox:{flexDirection:'row', gap:10, marginBottom:12},
  roleBtn:{flex:1, padding:10, borderRadius:10, backgroundColor:'#F0F0F0', alignItems:'center'},
  roleActive:{backgroundColor:'#E8F5E9', borderWidth:1, borderColor:'#2E7D32'}, roleTxt:{fontWeight:'600', color:'#333'},
  authBtn:{backgroundColor:'#2E7D32', padding:14, borderRadius:10, alignItems:'center', marginTop:8},
  authBtnText:{color:'#fff', fontSize:16, fontWeight:'bold'},
  authSwitch:{textAlign:'center', marginTop:16, color:'#4A90E2', fontWeight:'500'}
});