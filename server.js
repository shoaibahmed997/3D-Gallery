const express = require("express");
const sqlite3 = require('sqlite3')
const jwt = require('jsonwebtoken')
const formidable = require('formidable')

const app = express()
const secretKey = 'helloworldthisismyjsonwebtokensecretkey'
app.use(express.static('public'))
app.use(express.static('uploads'))

app.use(express.json())
const fs = require('fs');


const db = new sqlite3.Database('data.db',(err)=>{
    if (err){
        console.log(err)
    }else{
        db.get("PRAGMA foreign_keys = ON")
        db.run('CREATE TABLE IF NOT EXISTS Users (id integer primary key AUTOINCREMENT  , nickname varchar(8) NOT NULL, password text NOT NULL, email text UNIQUE NOT NULL );',(res,err)=>{
            if (err){
                console.log(err)
            }
        })
        db.run('CREATE TABLE IF NOT EXISTS Uploads (id integer primary key AUTOINCREMENT, user text NOT NULL, filepath text NOT NULL, type text , FOREIGN KEY (user) REFERENCES Users (email) );',(err)=>{
            if (err){
                console.log(err)
            }
        })
        console.log('database created successfully ')
    }
})


app.get('/',(req,res)=>{
    res.sendFile(__dirname+ '/public/index.html')
})

app.post('/api/signup',async (req,res)=>{
    const {nickname,email,password} = req.body
    console.log(nickname,email,password)
    db.run('INSERT INTO Users (nickname,password,email) VALUES(?,?,?);',[nickname,password,email],(err)=>{
        if (err){
            console.log(err)
            res.json({error:err,success:false})
        }else{
            const token =  jwt.sign({email},secretKey,{expiresIn:'2 days'})
            res.json({success:true,token:token,user:{nickname,email}})
        }
    })

})

app.post('/api/login',async(req,res)=>{
    const {email,password} = req.body
    db.get('SELECT * FROM Users WHERE email=? and password=?',[email,password],(err,rows)=>{
        if (err){
            res.json({error:err,success:false})
        }else{
            if(rows){
                const token =  jwt.sign({email},secretKey,{expiresIn:'2 days'})
                res.json({success:true,token:token,user:{nickname:rows.nickname,email:rows.email,id:rows.id}})
            }else{
                res.json({success:false,error:'UserNotFoundError 803!'})
            }
        }
    })
})

app.get('/api/token/verify',(req,res)=>{
    try {
        const {token} = req.headers
        const tokenData = jwt.verify(token,secretKey)
        db.get("SELECT id,nickname,email from Users WHERE email=?;",[tokenData.email],(err,row)=>{
            if (err){
                res.status(500).json({success:false,error:err})
            }else{
                if(row){
                    res.status(200).json({success:true,user:{nickname:row.nickname,email:row.email,id:row.id}})
                }else{
                    res.status(401).json({success:false,error:'UnAuthorised!'})
                }
            }
        })
    } catch (error) {
        
    }
})


function Check(req,res,next){
    const token = req.headers['token']
    const data = jwt.verify(token,secretKey)
    db.get('SELECT email FROM Users WHERE email=?;',[data.email],(err,rows)=>{
        if(err){
            res.json({success:false,error:err})
        }else{
            if(rows){
                req.email = rows.email
                next()
            }else{
                res.json({success:false,error:'UserNotFoundError 404!'})
            }
        }
    });

}

function ImagesLength(req,res,next){
    db.all('SELECT id FROM Uploads WHERE user=?;',[req.email],(err,rows)=>{
        if (err){
            console.log(err)
            res.json({success:false,error:'DataNotFoundError 404!'})
        }else{
            if(rows.length<15){
                next()
            }else{
                res.json({success:false,error:'Cannot Upload More than 15 Pictures !'})
            }
        }
    })
}


app.post('/api/upload',[Check,ImagesLength],async(req,res)=>{
    try {
        const form = new formidable.IncomingForm()
        form.multiple = true
        form.allowEmptyFiles = false
        form.maxFileSize = 1 * 1024 * 1024 // 1mb
        const uploadFolder  = './uploads/'
        form.uploadDir = uploadFolder
        let maxAllowedSize = 1 * 1024 * 1024; // 1mb
        form.parse(req)

        let randomness = (Math.random()*10).toString(36).substring(2,9) 
        let myerr= false
        form.on('fileBegin',(name,file)=>{
            let newfilename = randomness + file.originalFilename
            file.filepath  = './uploads/'+ newfilename
           
        })
      
        form.on('file',(name,file)=>{
            let newfilename = randomness + file.originalFilename
            if(file.size > maxAllowedSize ){
                fs.unlinkSync(file.filepath)
                res.status(301).json({success:false,error:"file size bigger than 1 mb"})
                myerr = true

            }else{
                db.run('INSERT INTO Uploads(user,filepath,type) VALUES (?,?,?)',[req.email,newfilename,file.mimetype],(err)=>{
                    if(err){
                        res.json({success:false,error:err})
                        myerr= true
                    }
                })
            }
        })

        form.once('error',(e)=>{
            res.json({success:false,error:e})
            return
        })

        form.once('end',()=>{
            if(!myerr){
                res.status(200).json({success:true,msg:"file uploaded Successfully"})
            }
        })




    } catch (error) {
        res.json({success:false,error:error})
        return
    }
})


app.get('/api/gallery',async(req,res)=>{
    try {
        const {token} = req.headers
        if(token){
            const data = jwt.verify(token,secretKey)
            db.all('SELECT * FROM Uploads WHERE user=?',[data.email],(err,rows)=>{
                res.json({success:true,data:rows})
            })
        }else{
            res.json({success:false,error:"Token Not Provided"})
        }
        
    } catch (error) {
        res.json({success:false,error:error})
    }
    
})

app.get('/api/image/delete/:id',Check,(req,res)=>{
    try {
        const id = req.params.id
        db.get('DELETE FROM Uploads WHERE id = ? returning * ;',[id],(err,row)=>{
            if(err){
                res.json({success:false,error:err})
            }else{
                fs.unlinkSync(`./uploads/${row.filepath}`)
                res.json({success:true,row:row})
            }

        })

    } catch (error) {
        res.json({success:false,error})
    }
})




app.listen(process.env.PORT || 5000 ,()=>{
    console.log('server started')
})