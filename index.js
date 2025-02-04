const express = require("express")
const ejs = require("ejs")
const mongoose=require("mongoose")
const bcrypt = require("bcrypt")
const dotenv = require("dotenv")
const path = require("path")
const jwt=require("jsonwebtoken")
const cookieParser = require("cookie-parser")


const PORT = 3000
const server = express()
const static_pages = path.join(__dirname, "./public")
const startpage = path.join(__dirname, "./views/index.ejs")
const forgotpasswordpage = path.join(__dirname, "./views/pages/forgotpassword.ejs")
let username = ""

const authToken=(req,res,next)=>{
    const token=req.cookies.auth_token
    if(!token){
        res.render(startpage, { userLogged: false, route: "/login", status: "Token Not Found" });
    }

    try{
        const decoded=jwt.verify(token,process.env.SECRET_KEY)
        next()
    }
    catch(err){
        res.clearCookie("auth_token")
        return res.render(startpage, { userLogged: false, route: "/login", status: "Unauthorized Request" });
    }

}

dotenv.config()
server.set("view engine", "ejs")
server.set("views", "./views")
server.use(cookieParser())
server.use(express.static(static_pages))
server.use(express.json())
server.use(express.urlencoded({ extended: true }))


mongoose.connect(process.env.MONGO_URI).then(() => {
    console.log("MongoDB connection Established Successfully");
}).catch(() => {
    console.log("MongoDB Connection Failed");
})

const userSchema = new mongoose.Schema({
    full_name: String,
    email: String,
    gender: String,
    password: String,
    repassword: String,
    security_question: String,
    security_answer: String,
    profile_img: String,
    savingsAmount: Number
})

const trackerSchema = new mongoose.Schema({
    email: String,
    budget_id: String,
    budget: Number,
    budget_type: String,
    startDate: Date,
    endDate: Date,
    totalspending: Number,
    totalremaining: Number,
    primary: Number,
    secondary: Number,
    others: Number,
    status: String
})

const buddySchema = new mongoose.Schema({
    email: String,
    budget_id: String,
    amount: Number,
    category: String,
    purpose: String,
    paymentmode: String,
    paymentreceiver: String,
    date: Date
})

const userModel = mongoose.model("user", userSchema)
const trackerModel = mongoose.model("tracker", trackerSchema)
const buddyModel = mongoose.model("buddie", buddySchema)

server.get("/", (req, res) => {
    res.render(startpage, { userLogged: false, route: "/" });
})
server.get("/register", (req, res) => {
    res.render(startpage, { userLogged: false, route: "/register", status: "" });
})
server.get("/login", (req, res) => {
    res.render(startpage, { userLogged: false, route: "/login", status: "" });
})
server.get("/forgotpassword", (req, res) => {
    res.render(forgotpasswordpage, { password: "" })
})
server.get("/changepassword",authToken, (req, res) => {
    res.render(startpage, { userLogged: username, route: "/changepassword" })
})
server.get("/changeprofile", authToken,(req, res) => {
    res.render(startpage, { userLogged: username, route: "/changeprofile" })
})


server.get("/home",authToken,async (req, res) => {
    const token=req.cookies.auth_token
    if(!token){
        res.render(startpage, { userLogged: false, route: "/login", status: "Token Not Found" });
    }
    try{
        const decoded=jwt.verify(token,process.env.SECRET_KEY)
        res.render(startpage, { userLogged: username, route: "/home" })
    }
    catch(err){
        res.clearCookie("auth-token")
        res.render(startpage, { userLogged: false, route: "/login", status: "UnAuthorized Request" });
    }
    
})
server.get("/present",authToken, async (req, res) => {
    res.render(startpage, { userLogged: username, route: "/present" })
})
server.get("/past",authToken, async (req, res) => {
    res.render(startpage, { userLogged: username, route: "/past" })
})




server.post("/adduser", async (req, res) => {
    try {
        const { full_name, email, gender, password, repassword, security_question, security_answer } = req.body;
        const dummyuser = await userModel.findOne({ email: email })
        let status = ""
        if (!dummyuser) {
            if (password === repassword) {
                let hashpassword = bcrypt.hashSync(password, 10)
                let address;
                if (gender === "Male") {
                    address = "/images/boyprofile.png"
                }
                else if (gender === "Female") {
                    address = "/images/girlprofile.jpeg"
                }
                else {
                    address = "/images/others.png"
                }
                const newUserToadd = new userModel({ full_name, email, gender, password: hashpassword, repassword, security_question, security_answer, profile_img: address, savingsAmount: 0 })
                await newUserToadd.save()
                status = "Registered successfully."
                username.profile_img = address
            }
            else {
                status = "Password doesn't matches."
            }
        }
        else {
            status = "Useremail already existed.please use differnt email or login with existed email"
        }
        res.render(startpage, { userLogged: false, route: "/register", status: status })
    }
    catch (err) {
        console.error("Error fetching tracker data:", err);
        res.status(500).json({ message: "Server error. Please try again later." });
    }
})

server.post("/signin", async (req, res) => {
    const { email, password } = req.body
    try {
        const userData = await userModel.findOne({ email: email })
        if (!userData) {
            res.render(startpage, { userLogged: false, route: "/login", status: "Enter correct email address" })
        }
        else {
            const isMatch = bcrypt.compareSync(password, userData.password)
            if (isMatch) {
                const dummyData = await trackerModel.find({ email: userData.email, status: "Not Active" })
                let saving = 0
                const token=jwt.sign({email},process.env.SECRET_KEY,{expiresIn:"1hr"})
                res.cookie("auth_token",token,{
                    httpOnly:true,
                    secure:process.env.NODE_ENV==="production"
                })
                dummyData.forEach(async (tracker) => {
                    if (tracker.totalremaining) {
                        saving = saving + tracker.totalremaining
                        await trackerModel.findOneAndUpdate({ budget_id: tracker.budget_id }, { $set: { totalremaining: 0 } }, { new: true, runValidators: true })
                        await userModel.findOneAndUpdate({ email: userData.email }, { $set: { savingsAmount: saving } }, { new: true, runValidators: true })
                    }
                })
                username = userData
                const tracker = await trackerModel.findOne({ email: userData.email, status: "active" })
                const curr = new Date()
                if (tracker) {
                    username.spendingpercent = (tracker.totalspending / tracker.budget) * 100
                    username.remainingpercent = (tracker.totalremaining / tracker.budget) * 100
                    if (curr >= tracker.endDate) {
                        username.status = ""
                        username.budget_id = ""
                        tracker.status = "Not Active"
                    }
                    else {
                        username.status = "active"
                        username.budget_id = tracker.budget_id
                    }
                }
                else {
                    username.status = ""
                    username.startyear = ""
                    username.endyear = ""
                    username.budget_id = ""
                    username.spendingpercent = 0
                    username.remainingpercent = 0
                }
                const tracker1 = await trackerModel.findOne({ email: userData.email }, { startDate: 1 }).sort({ startDate: 1 }).limit(1)
                const tracker2 = await trackerModel.findOne({ email: userData.email }, { startDate: 1 }).sort({ startDate: -1 }).limit(1)
                if (tracker1 && tracker2) {
                    username.startyear = tracker1.startDate.getFullYear()
                    username.endyear = tracker2.startDate.getFullYear()
                }
                let temp = await userModel.findOne({ email: username.email })
                username.savingsAmount = temp.savingsAmount
                username.finder = []
                username.message2 = []
                username.primary = 0
                username.secondary = 0
                username.others = 0
                username.message3 = ""
                res.render(startpage, { userLogged: username, route: "/home" })
            }
            else {
                res.render(startpage, { userLogged: false, route: "/login", status: "Invalid credentials" })
            }
        }
    }
    catch (err) {
        console.error("Error fetching tracker data:", err);
        res.status(500).json({ message: "Server error. Please try again later." });
    }
})

server.post("/showpassword", async (req, res) => {
    const { email, security_question, security_answer } = req.body
    try {
        const userData = await userModel.findOne({ email: email })
        if (!userData) {
            res.render(forgotpasswordpage, { password: "invalid" })
        }
        else {
            if (userData.email === email && userData.security_question === security_question && userData.security_answer === security_answer) {
                res.render(forgotpasswordpage, { password: userData.repassword })
            }
            else {
                res.render(forgotpasswordpage, { password: "invalid" })
            }
        }
    }
    catch (err) {
        console.error("Error fetching tracker data:", err);
        res.status(500).json({ message: "Server error. Please try again later." });
    }
})


server.post("/submitbudget", async (req, res) => {
    const { budget, budget_type } = req.body
    const startDate = new Date()
    const curr = new Date()
    const budget_id = curr.getDate() + "#" + curr.getMonth() + "#" + curr.getFullYear() + "#" + curr.getTime()
    if (budget_type === 'year') {
        let temp = curr.getFullYear() + 1
        curr.setFullYear(temp)
    }
    else if (budget_type === "month") {
        let temp = curr.getMonth() + 1
        curr.setMonth(temp)
    }
    else {
        let temp = curr.getDate() + 7
        curr.setDate(temp)
    }
    try {
        const endDate = curr
        const trackerToAdd = await trackerModel({ email: username.email, budget_id: budget_id, budget, budget_type, startDate: startDate, endDate: endDate, totalspending: 0, totalremaining: budget, primary: 0, secondary: 0, others: 0, status: "active" })
        await trackerToAdd.save()
        username.status = ""
        username.budget_id = budget_id
        const tracker1 = await trackerModel.findOne({ email: username.email }, { startDate: 1 }).sort({ startDate: 1 }).limit(1)
        const tracker2 = await trackerModel.findOne({ email: username.email }, { startDate: 1 }).sort({ startDate: -1 }).limit(1)
        username.startyear = tracker1.startDate.getFullYear()
        username.endyear = tracker2.startDate.getFullYear()
        username.finder = []
        username.message2 = []
        username.spendingpercent = 0
        username.remainingpercent = 100
        username.primary = 0
        username.secondary = 0
        username.others = 0
        username.track_message = "Buddy Tracker created Successfully"
        res.render(startpage, { userLogged: username, route: "/home" })
        username.status = "active"
        username.track_message = ""
    }
    catch (err) {
        console.error("Error fetching tracker data:", err);
        res.status(500).json({ message: "Server error. Please try again later." });
    }

})
server.get("/logout", (req, res) => {
    res.clearCookie("auth_token")
    username = ""
    res.render(startpage, { userLogged: false, route: "/login", status: "" });
})

server.post("/search", async (req, res) => {
    const { year, month } = req.body
    try {
        const dummyData = await trackerModel.find({ email: username.email }, { budget_id: 1, budget_type: 1, startDate: 1 })
        username.finder = []
        dummyData.forEach((user) => {
            if (user.startDate.getFullYear() === Number(year) && user.startDate.getMonth() === Number(month)) {
                username.finder.push(user)
            }
        })
        res.render(startpage, { userLogged: username, route: "/home" })
        username.finder = []
    }
    catch (err) {
        console.error("Error fetching tracker data:", err);
        res.status(500).json({ message: "Server error. Please try again later." });
    }
})

server.post("/savingsadd", async (req, res) => {
    const { savingsmoney, receiver } = req.body
    try {
        const totalsavings = await userModel.findOne({ email: username.email })
        const dummyuser = await trackerModel.findOne({ email: username.email, budget_id: username.budget_id })
        if (Number(savingsmoney) <= totalsavings.savingsAmount) {
            if (receiver === "current") {
                if (username.status === "active") {
                    let temp1 = totalsavings.savingsAmount - Number(savingsmoney)
                    await userModel.findOneAndUpdate({ email: username.email }, { $set: { savingsAmount: temp1 } }, { new: true, runValidators: true })
                    let temp2 = dummyuser.totalremaining + Number(savingsmoney)
                    let temp3 = dummyuser.budget + Number(savingsmoney)
                    await trackerModel.findOneAndUpdate({ email: username.email }, { $set: { totalremaining: temp2, budget: temp3 } }, { new: true, runValidators: true })
                    username.issavings = "Transferred success"
                    username.savingsAmount = temp1
                    username.remainingpercent = (temp2 / temp3) * 100;
                    username.spendingpercent = (dummyuser.totalspending / temp3) * 100;
                }
                else {
                    username.issavings = "No Active budget tracker"
                }
            }
            else {
                if (username.status === "active") {
                    username.issavings = "Already tracker is Active"
                }
                else {
                    let temp1 = totalsavings.savingsAmount - Number(savingsmoney)
                    await fetch("http://localhost:3000/submitbudget", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ budget: Number(savingsmoney), budget_type: "Savings Amount" })
                    })
                    username.issavings = "New Budget created for one week"
                    username.savingsAmount = temp1

                    await userModel.findOneAndUpdate({ email: username.email }, { $set: { savingsAmount: temp1 } }, { new: true, runValidators: true })
                }
            }
        }
        else {
            username.issavings = "Insufficient Amount"
        }
        res.render(startpage, { userLogged: username, route: "/home" })
        username.issavings = ""
    }
    catch (err) {
        console.error("Error fetching tracker data:", err);
        res.status(500).json({ message: "Server error. Please try again later." });
    }
})

server.post("/addtracks", async (req, res) => {
    const { amount, primary, secondary, others, category, paymentmode, paymentreceiver } = req.body
    try {
        let dummyuser = await trackerModel.findOne({ email: username.email, budget_id: username.budget_id })
        let purp = ""
        let temp = null
        let spend = dummyuser.totalspending + Number(amount)
        let remain = dummyuser.totalremaining - Number(amount)
        let curr = new Date()
        if (Number(amount) <= dummyuser.totalremaining) {
            if (category === "primary") {
                purp = primary
                temp = dummyuser.primary + Number(amount)
                await trackerModel.findOneAndUpdate({ email: username.email, budget_id: username.budget_id }, { $set: { totalspending: spend, totalremaining: remain, primary: temp } }, { new: true, runValidators: true })

            }
            else if (category === "secondary") {
                purp = secondary
                temp = dummyuser.secondary + Number(amount)
                await trackerModel.findOneAndUpdate({ email: username.email, budget_id: username.budget_id }, { $set: { totalspending: spend, totalremaining: remain, secondary: temp } }, { new: true, runValidators: true })

            }
            else {
                purp = others
                temp = dummyuser.others + Number(amount)
                await trackerModel.findOneAndUpdate({ email: username.email, budget_id: username.budget_id }, { $set: { totalspending: spend, totalremaining: remain, others: temp } }, { new: true, runValidators: true })

            }
            const BuddyToAdd = await buddyModel({ email: username.email, budget_id: username.budget_id, amount, category, purpose: purp, paymentmode, paymentreceiver, date: curr, })
            await BuddyToAdd.save()
            username.message1 = "Buddy Added successfully"
            username.spendingpercent = (spend / dummyuser.budget) * 100
            username.remainingpercent = (remain / dummyuser.budget) * 100
        }
        else {
            username.message1 = "Insufficient Budget"
        }
        res.render(startpage, { userLogged: username, route: "/present" })
        username.message1 = ""
    }
    catch (err) {
        console.error("Error fetching tracker data:", err);
        res.status(500).json({ message: "Server error. Please try again later." });
    }
})


server.post("/check", async (req, res) => {
    const { budget_id } = req.body
    try {
        let dummyData = await buddyModel.find({ email: username.email, budget_id: budget_id })
        username.message2 = dummyData
        let dummyuser = await trackerModel.findOne({ email: username.email, budget_id: budget_id })
        username.primary = (dummyuser.primary / dummyuser.totalspending) * 100
        username.secondary = (dummyuser.secondary / dummyuser.totalspending) * 100
        username.others = (dummyuser.others / dummyuser.totalspending) * 100

        res.render(startpage, { userLogged: username, route: "/present" })
        username.message2 = []
        username.primary = 0
        username.secondary = 0
        username.others = 0
    }
    catch (err) {
        console.error("Error fetching tracker data:", err);
        res.status(500).json({ message: "Server error. Please try again later." });
    }
})

server.post("/fetchdata", async (req, res) => {
    const { year, month } = req.body
    try {
        const dummyData = await trackerModel.find({ email: username.email })
        let trackerData = []
        if (year && month === "") {
            dummyData.forEach((track) => {
                if (track.startDate.getFullYear() === Number(year)) {
                    trackerData.push(track)
                }
            })
        }
        else {
            dummyData.forEach((track) => {
                if (track.startDate.getFullYear() === Number(req.body.year) && track.startDate.getMonth() === Number(month)) {
                    trackerData.push(track)
                }
            })
        }
        res.status(200).json({ trackerData })
    }
    catch (err) {
        console.error("Error fetching tracker data:", err);
        res.status(500).json({ message: "Server error. Please try again later." });
    }
})


server.post("/changepassword", async (req, res) => {
    const { oldpassword, newpassword, repassword } = req.body
    try {
        const currUser = await userModel.findOne({ email: username.email })
        const isMatch = bcrypt.compareSync(oldpassword, currUser.password)
        if (isMatch) {
            let hashedpassword = bcrypt.hashSync(newpassword, 10)
            await userModel.findOneAndUpdate({ email: currUser.email }, { $set: { password: hashedpassword, repassword: repassword } }, { new: true, runValidators: true })
            username.message3 = "Password reset successfull"
        }
        else {
            username.message3 = "Invalid password"
        }
        res.render(startpage, { userLogged: username, route: "/changepassword" })
        username.message3 = ""
    }
    catch (err) {
        console.error("Error fetching tracker data:", err);
        res.status(500).json({ message: "Server error. Please try again later." });
    }
})

server.post("/upload", async (req, res) => {
    const { photo } = req.body
    username.profile_img = photo
    try {
        await userModel.findOneAndUpdate({ email: username.email }, { $set: { profile_img: photo } }, { new: true, runValidators: true })
        res.render(startpage, { userLogged: username, route: "/home" })
    }
    catch (err) {
        console.error("Error fetching tracker data:", err);
        res.status(500).json({ message: "Server error. Please try again later." });
    }
})

server.listen(PORT, () => {
    console.log(`http://localhost:${PORT}`);
})
