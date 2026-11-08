"""Construit local-stripe-test/public/index.html à partir d'une vraie page du site (bandeau du haut, fond, pied de page),
avec le formulaire de don (modèle AlloDons) à la place du contenu. Relancer : python3 build.py"""
import re, os
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, '..', 'public')
src = open(os.path.join(SITE, 'colis', 'index.html'), encoding='utf-8').read()
LOCAL = 'http://localhost:3000'   # les liens du menu vont vers le site local

CSS_ACCT = r'''
/* compte donateur */
#dn [hidden],.dn-acct [hidden],.dn-acct[hidden]{display:none!important}
.dn-acct{max-width:1040px;margin:-4px auto 16px}
.dn-acct-out{display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;color:#51666a;flex-wrap:wrap}
.dn-link{border:0;background:none;padding:0;font:inherit;font-weight:700;color:var(--teal);text-decoration:underline;text-decoration-color:rgba(196,162,74,.8);text-underline-offset:3px;cursor:pointer}
.dn-acct-box{background:#fff;border:2px solid #e3d29c;border-radius:20px;padding:16px 16px 14px;box-shadow:0 10px 30px rgba(20,60,66,.12);max-width:560px;margin:0 auto}
.dn-acct-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
.dn-acct-h b{font-family:'Bree Serif',serif;font-weight:400;font-size:19px;color:var(--teal)}
.dn-x{border:0;background:#eef3f3;color:#51666a;width:32px;height:32px;border-radius:50%;font-size:14px;cursor:pointer}
.dn-acct-p{font-size:13.5px;color:#51666a;margin:0 0 10px;line-height:1.5}
.dn-row{display:flex;gap:8px;align-items:stretch}
.dn-row input{flex:1;min-width:0}
.dn-btn.sm{flex:none;height:46px;font-size:14.5px;padding:0 16px;margin:0;white-space:nowrap}
#dn input.dn-otp{height:56px;font-family:'Courier New',monospace;font-size:28px;letter-spacing:12px;text-align:center;font-weight:700}
.dn-acct-box{position:relative;padding:22px 20px 20px;border:1px solid #e3d29c;border-radius:22px;box-shadow:0 14px 40px rgba(20,60,66,.14)}
.dn-acct-h{justify-content:flex-start;gap:12px;margin:0 0 8px;padding-right:36px}
.dn-ico{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:linear-gradient(180deg,#f3e6b8,#e2c878);color:#14464e;flex:none}
.dn-acct-h b{font-size:21px}
.dn-acct-box .dn-x{position:absolute;top:14px;right:14px;width:32px;height:32px;border-radius:50%;font-size:13px;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;background:#eef3f3;color:#51666a;border:0;cursor:pointer}
.dn-acct-box .dn-acct-p{font-size:14px;margin:0 0 14px}
#dn .dn-acct-box .dn-row input{height:54px;min-height:54px;font-size:16px;border-radius:14px;padding:0 18px;box-sizing:border-box}
#dn .dn-acct-box .dn-row{gap:10px}
.dn-acct-box .dn-btn.sm{height:52px;padding:0 22px;white-space:nowrap}
.dn-acct-err{font-size:13.5px;color:#8a2a22;background:#fdecea;border-radius:10px;padding:8px 11px;margin:8px 0 0}
.dn-acct-in{display:flex;align-items:center;gap:11px;justify-content:center;background:#effaf3;border:1px solid #bfe3cf;border-radius:16px;padding:10px 14px;max-width:560px;margin:0 auto}
.dn-av{width:34px;height:34px;border-radius:50%;background:#2c8a5a;color:#fff;display:grid;place-items:center;font-weight:700;flex:none}
.dn-acct-in b{display:block;font-size:14.5px;color:#14272a;word-break:break-all}
.dn-acct-in small{display:block;font-size:12.5px;color:#51666a}
.dn-acct-in a{color:var(--teal);font-weight:600}
/* profils façon Uber */
.dn-pcards{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:2px 0 16px}
.dn-pcard{display:flex;align-items:center;gap:10px;text-align:left;border:2px solid #d3e0e0;background:#fff;border-radius:16px;padding:11px 12px;font:inherit;cursor:pointer;transition:.18s;min-width:0}
.dn-pcard .ic{width:38px;height:38px;border-radius:50%;background:#e6f0f0;display:grid;place-items:center;font-size:18px;flex:none}
.dn-pcard b{display:block;font-size:14.5px;color:#24505a;line-height:1.2}
.dn-pcard small{display:block;font-size:12px;color:#7f9396;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dn-pcard.on{border-color:var(--gold);background:#fff8e6;box-shadow:0 6px 16px rgba(196,162,74,.25)}
.dn-pcard.on .ic{background:var(--gold-l)}
.dn-pcard.add small{color:var(--teal);font-weight:600}
.dn-conn .dn-type{display:none}
.dn-savep{display:none}.dn-conn .dn-savep{display:block}.dn-conn .dn-guestsave{display:none}
.dn-guestsave{font-size:13.5px;color:#51666a;background:#f3f8f7;border-radius:12px;padding:10px 12px}
.dn-siretmsg{display:block;min-height:18px;margin-top:6px;font-size:13px;color:#51666a}.dn-siretmsg.ok{color:#1d6b43}.dn-siretmsg.ko{color:#8a2a22}
.dn-hint{margin:0 0 14px;padding:11px 13px;border-radius:12px;background:#fff8e1;border:1px solid #ecdca0;color:#6b5412;font-size:13.5px;line-height:1.5}
.dn-profs{display:none}.dn-conn .dn-profs{display:block}
.dn-savep{display:none}.dn-conn .dn-savep{display:block}
#dn input[readonly]{background:#f3f7f7;color:#51666a}
.dn-cta{margin-top:16px;padding:14px;border:1px dashed #cfe0e0;border-radius:16px;background:#f8fbfb;text-align:center}
.dn-cta p{margin:0 0 4px;font-size:14px;color:#3b5156}
.dn-cta small{display:block;color:#7f9396;font-size:12px;margin-bottom:8px}
.dn-cta a{display:inline-block;padding:11px 20px;border-radius:99px;background:var(--teal);color:#fff;font-weight:700;text-decoration:none;font-size:14.5px}
/* espace donateur */
.sp-wrap{max-width:760px;margin:0 auto;padding:0 14px}
.sp-card{background:rgba(255,255,255,.98);border:1px solid #e3ecec;border-radius:22px;box-shadow:0 14px 40px rgba(20,60,66,.12);padding:20px 20px 18px}
.sp-head{display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.sp-head .dn-av{width:44px;height:44px;font-size:18px;background:var(--teal)}
.sp-head b{display:block;color:#14272a;font-size:15px;word-break:break-all}
.sp-head small{color:#7f9396;font-size:12.5px}
.sp-head .act{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
.sp-pill{border:1.5px solid #cfe0e0;background:#fff;color:var(--teal);font:inherit;font-weight:700;font-size:13.5px;padding:9px 15px;border-radius:99px;cursor:pointer;text-decoration:none;display:inline-block}
.sp-pill.gold{background:linear-gradient(180deg,var(--gold-l),var(--gold));border-color:var(--gold);color:#1b2b2d}
.sp-tabs{display:flex;gap:4px;background:#e6f0f0;padding:4px;border-radius:99px;margin:0 0 16px}
.sp-tabs button{flex:1;border:0;background:transparent;font:inherit;font-weight:700;font-size:14px;color:var(--teal);padding:11px 8px;border-radius:99px;cursor:pointer}
.sp-tabs button.on{background:#fff;box-shadow:0 3px 10px rgba(20,60,66,.16);color:#164c52}
.sp-year{margin:0 0 22px}
.sp-yh{display:flex;align-items:baseline;justify-content:space-between;gap:10px;border-bottom:2px solid var(--gold);padding-bottom:6px;margin-bottom:6px}
.sp-yh h3{font-family:'Bree Serif',serif;font-weight:400;font-size:26px;color:var(--teal);margin:0}
.sp-yh span{font-size:13.5px;color:#51666a;text-align:right}
.sp-yh span b{color:#14272a}
.sp-note{font-size:12.5px;color:#7f9396;margin:4px 0 8px}
.sp-r{display:grid;grid-template-columns:1fr auto;gap:6px 12px;align-items:center;padding:13px 2px;border-bottom:1px solid #e9eeee}
.sp-r .l b{display:block;font-size:15px;color:#14272a}
.sp-r .l small{display:block;font-size:12.5px;color:#7f9396;margin-top:2px}
.sp-r .tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:2px 8px;border-radius:99px;background:#e6f0f0;color:#24505a;margin-left:6px;vertical-align:1px}
.sp-r .tag.m{background:#fff3d6;color:#7a5f14}
.sp-r .amt{font-family:'Bree Serif',serif;font-size:21px;color:var(--teal);text-align:right;line-height:1.1}
.sp-r .dl{grid-column:1/-1;justify-self:start}
.sp-empty{text-align:center;padding:26px 8px;color:#51666a}
.sp-form{border:1px solid #e3ecec;border-radius:18px;padding:14px 14px 12px;margin-bottom:14px;background:#fff}
.sp-form h4{margin:0 0 10px;font-family:'Bree Serif',serif;font-weight:400;font-size:18px;color:var(--teal);display:flex;align-items:center;gap:8px}
.sp-ok{font-size:13px;color:#1d6b43;margin:8px 0 0}
@media(max-width:600px){.dn-pcards{grid-template-columns:1fr}.sp-yh{flex-direction:column;gap:2px}.sp-yh span{text-align:left}.sp-head .act{margin-left:0;width:100%}.dn-row{flex-direction:column}.dn-btn.sm{height:48px}}
'''
CSS = r"""
#wab{display:none!important}
#dn{padding:20px 0 40px;overflow-x:clip}
.dn-wrap{max-width:1040px;margin:0 auto;padding:0 16px}
.dn-pill{display:inline-block;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.4);color:#fff;font-size:11.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:6px 13px;border-radius:99px;margin-top:12px}
/* étapes */
.dn-steps{position:relative;display:flex;justify-content:space-between;list-style:none;padding:0;margin:4px auto 22px;max-width:560px;counter-reset:s}
.dn-steps::before{content:"";position:absolute;left:16%;right:16%;top:13px;height:4px;border-radius:4px;background:#dbe6e6}
.dn-fill{position:absolute;left:16%;top:13px;height:4px;border-radius:4px;background:linear-gradient(90deg,var(--gold),var(--gold-l));width:0;transition:width .6s cubic-bezier(.2,.8,.2,1)}
.dn-steps li{position:relative;flex:1;text-align:center;font-size:12px;font-weight:700;color:#85999c;counter-increment:s;transition:color .3s}
.dn-steps li::before{content:counter(s);display:grid;place-items:center;width:30px;height:30px;border-radius:50%;margin:0 auto 5px;background:#fff;border:3px solid #dbe6e6;font-family:'Bree Serif',serif;font-size:14px;font-weight:400;color:#85999c;transition:.3s;position:relative;z-index:1}
.dn-steps li.on{color:#7a5f14}.dn-steps li.on::before{border-color:var(--gold);color:#1b2b2d;background:var(--gold-l);box-shadow:0 0 0 5px rgba(196,162,74,.22)}
.dn-steps li.done{color:var(--teal)}.dn-steps li.done::before{content:"✓";background:var(--teal);border-color:var(--teal);color:#fff;font-family:Inter,sans-serif;font-weight:700}
.dn-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:22px;align-items:start;max-width:1040px;margin:0 auto}
.dn-card{background:rgba(255,255,255,.98);border:1px solid #e3ecec;border-radius:26px;box-shadow:0 16px 44px rgba(20,60,66,.13)}
.dn-form{padding:20px 22px 22px;position:relative}
.dn-tools{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;margin-bottom:2px}
.dn-tabs{display:flex;gap:4px;background:#e6f0f0;padding:4px;border-radius:99px}
.dn-tab{border:0;background:transparent;font:inherit;font-weight:600;font-size:13.5px;color:var(--teal);padding:9px 14px;border-radius:99px;cursor:pointer;transition:.2s;white-space:nowrap}
.dn-tab.on{background:#fff;box-shadow:0 3px 10px rgba(20,60,66,.16);color:#164c52}
.dn-rand{border:1.5px dashed #c4a24a;background:#fffaf0;color:#7a5f14;font:inherit;font-weight:600;font-size:12.5px;padding:8px 13px;border-radius:99px;cursor:pointer}
.dn-panel{display:none;animation:dnIn .4s ease both}
.dn-panel.on{display:block}
@keyframes dnIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}
.dn-h{font-family:'Bree Serif',serif;font-size:21px;color:var(--teal);margin:12px 0 3px;line-height:1.15}
.dn-p{color:#51666a;font-size:13.5px;margin:0 0 12px}
.dn-lab{font-size:12px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:#9a7a22;margin:26px 0 10px}
.dn-lab.first{margin-top:14px}
.dn-tools{display:none}.test-on .dn-tools{display:flex}
.dn-amts{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:10px}
.dn-amts button{border:2px solid #d3e0e0;background:#fff;border-radius:16px;height:60px;font-family:'Bree Serif',serif;font-size:22px;color:var(--teal);cursor:pointer;transition:.18s;line-height:1;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.dn-amts button:active{transform:scale(.96)}
.dn-amts button.on{background:linear-gradient(180deg,var(--gold-l),var(--gold));border-color:var(--gold);color:#1b2b2d;box-shadow:0 8px 20px rgba(196,162,74,.42)}
.dn-other{position:relative}.dn-other input{padding-right:46px;font-weight:600}.dn-other span{position:absolute;right:18px;top:50%;transform:translateY(-50%);font-weight:700;color:var(--teal)}
.dn-freq{display:flex;background:#e6f0f0;border-radius:99px;padding:4px}
.dn-freq label{flex:1;margin:0;cursor:pointer}.dn-freq input{position:absolute;opacity:0;pointer-events:none}
.dn-freq span{display:block;text-align:center;padding:10px 8px;border-radius:99px;font-weight:700;font-size:14.5px;color:var(--teal);transition:.2s}
.dn-freq input:checked+span{background:#fff;box-shadow:0 3px 10px rgba(20,60,66,.18)}
.dn-sub{font-size:12.5px;color:#51666a;margin:8px 4px 0}
/* affectation : tuiles à toucher (2 colonnes), carte de fête en grand */
.dn-chips{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.dn-chip{margin:0!important;cursor:pointer;display:block!important;position:relative}
.dn-chip input{position:absolute;opacity:0;pointer-events:none;width:auto!important}
.dn-chip>span{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:9px;text-align:center;padding:16px 10px 14px;min-height:118px;border:2px solid #dbe6e6;border-radius:18px;background:#fff;transition:.18s;height:100%}
.dn-chip:hover>span{border-color:#b9d0d0;transform:translateY(-1px)}
.dn-ic{width:46px;height:46px;border-radius:50%;background:#e8f2f1;color:#1f6a72;display:grid;place-items:center;flex:none;transition:.18s}
.dn-ic svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.dn-chip em{font-style:normal;font-weight:700;font-size:14px;color:#1d4a53;line-height:1.25}
.dn-chip em small{display:block;font-weight:500;font-size:12px;color:#6a7f83;margin-top:2px}
.dn-chip i{position:absolute;top:10px;right:10px;width:20px;height:20px;border-radius:50%;border:2px solid #cbd9d9;transition:.18s}
.dn-chip input:checked+span{border-color:var(--gold);background:linear-gradient(180deg,#fffdf6,#fff6dc);box-shadow:0 8px 22px rgba(196,162,74,.25)}
.dn-chip input:checked+span .dn-ic{background:linear-gradient(180deg,var(--gold-l),var(--gold));color:#1b2b2d}
.dn-chip input:checked+span i{border-color:var(--teal);background:var(--teal)}
.dn-chip input:checked+span i::after{content:"";position:absolute;left:5px;top:1px;width:5px;height:10px;border:solid #fff;border-width:0 2.5px 2.5px 0;transform:rotate(45deg)}
/* fête qui approche : grande carte pleine largeur */
.dn-chip.fete{grid-column:1/-1}
.dn-chip.fete>span{flex-direction:row;text-align:left;gap:16px;padding:18px 18px;min-height:0;border-color:#e0c468;background:linear-gradient(135deg,#fffaf0,#fff0c8)}
.dn-chip.fete .dn-ic{width:62px;height:62px;background:#fff;box-shadow:0 4px 12px rgba(196,162,74,.35)}
.dn-chip.fete .dn-ic img{width:44px;height:44px;object-fit:contain}
.dn-chip.fete em{font-family:'Bree Serif',serif;font-weight:400;font-size:20px;color:#14464e;flex:1}
.dn-chip.fete em small{font-family:'Inter',sans-serif;font-size:13px;color:#7a5f14;margin-top:4px;font-weight:600}
.dn-chip.fete i{top:14px;right:14px}
.dn-soon{display:inline-block;margin-bottom:5px;padding:3px 10px;border-radius:99px;background:var(--teal);color:#fff;font-family:'Inter',sans-serif;font-size:11.5px;font-weight:700;letter-spacing:.3px}
.dn-colis{grid-column:1/-1}
.dn-chip2>span{flex-direction:row;min-height:42px;padding:8px 12px}
/* actions d'une fête (comme les lignes « Je participe… » d'AlloDons, en plus simple) */
.dn-act{border:2px solid #dbe6e6;border-radius:18px;background:#fff;margin-bottom:10px;transition:.18s;overflow:hidden}
.dn-act.on{border-color:var(--gold);background:linear-gradient(180deg,#fffdf6,#fff8e2);box-shadow:0 8px 22px rgba(196,162,74,.2)}
#dn .dn-actrow{display:flex!important;flex-direction:row;gap:13px;align-items:flex-start;padding:15px 16px;cursor:pointer;margin:0!important}
#dn .dn-actfree label{display:flex;align-items:baseline}
.dn-actrow input{position:absolute;opacity:0;pointer-events:none;width:auto!important}
.dn-actrow .bx{display:block;box-sizing:border-box;flex:none;width:24px;height:24px;min-width:24px;border-radius:8px;border:2px solid #c3d3d3;background:#fff;margin-top:1px;position:relative;transition:.18s}
.dn-act.on .bx{background:var(--teal);border-color:var(--teal)}
.dn-act.on .bx::after{content:"";position:absolute;left:7px;top:2px;width:6px;height:12px;border:solid #fff;border-width:0 3px 3px 0;transform:rotate(45deg)}
.dn-actrow .tx b{display:block;font-size:15px;line-height:1.3;color:#14464e}
.dn-actrow .tx small{display:block;margin-top:3px;font-size:13px;color:#6a7f83;line-height:1.4}
.dn-actamt{padding:0 16px 15px 53px}
.dn-actamt .dn-other{margin:0 0 9px}
.dn-actq{display:flex;gap:7px;flex-wrap:wrap}
.dn-actq button{border:1.5px solid #d3e0e0;background:#fff;color:var(--teal);font:inherit;font-weight:700;font-size:13.5px;border-radius:99px;padding:7px 14px;cursor:pointer}
.dn-actq button.on{background:var(--teal);border-color:var(--teal);color:#fff}
.dn-actfree{margin-top:4px}
.dn-actfree label{font-weight:700;font-size:14.5px;color:#14464e;margin:6px 0 8px;display:block}
.dn-actfree label small{font-weight:500;color:#6a7f83;margin-left:6px}
.dn-acttotal{display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding:14px 18px;border-radius:16px;background:#14464e;color:#fff}
.dn-acttotal span{font-size:14px;letter-spacing:.6px;text-transform:uppercase;opacity:.85}
.dn-acttotal b{font-family:'Bree Serif',serif;font-weight:400;font-size:26px}
#actBox[hidden],#amtBox[hidden]{display:none!important}
.dn-g{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.dn-full{grid-column:1/-1}
#dn label{display:block;font-size:13px;font-weight:600;color:#24505a;margin:0 0 6px}
#dn input:not([type=radio]):not([type=checkbox]),#dn select{width:100%;height:46px;padding:0 14px;border:2px solid #d3e0e0;border-radius:13px;font:inherit;font-size:16px;background:#fff;color:#14272a;outline:none;transition:border-color .2s,box-shadow .2s;box-shadow:none;-webkit-appearance:none;appearance:none}
#dn input:focus,#dn select:focus{border-color:var(--gold);box-shadow:0 0 0 4px rgba(196,162,74,.22)}
#dn select{background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='9' viewBox='0 0 14 9'%3E%3Cpath d='M1 1l6 6 6-6' fill='none' stroke='%231f6a72' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 16px center;padding-right:42px}
.dn-type{display:flex;gap:10px;margin-bottom:16px}
.dn-type label{flex:1;margin:0!important;cursor:pointer}
.dn-type input{position:absolute;opacity:0;pointer-events:none}
.dn-type span{display:block;text-align:center;padding:9px 8px;border:2px solid #d3e0e0;border-radius:14px;font-weight:700;font-size:14px;color:var(--teal);background:#fff;transition:.18s;line-height:1.25}
.dn-type span small{display:block;font-weight:500;font-size:12px;color:#51666a}
.dn-type input:checked+span{background:var(--teal);border-color:var(--teal);color:#fff}
.dn-type input:checked+span small{color:#cfe6e3}
.dn-ck{display:flex!important;gap:12px;align-items:flex-start;font-size:14.5px!important;font-weight:500!important;margin-top:8px!important;color:#2b4044!important;cursor:pointer}
#dn .dn-ck input{width:24px;height:24px;margin-top:0;flex:none;accent-color:var(--teal)}
.dn-ck small{display:block;color:#51666a;font-weight:400;font-size:12.5px}
/* barre d'action */
.dn-actions{display:flex;align-items:center;gap:14px;margin-top:22px}
.dn-bamt{min-width:0;flex:none}
.dn-bamt small{display:block;font-size:11.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:#7f9396}
.dn-bamt b{display:block;font-family:'Bree Serif',serif;font-weight:400;font-size:21px;color:var(--teal);line-height:1.1;white-space:nowrap}
.dn-bamt b em{font-style:normal;font-family:Inter,sans-serif;font-weight:600;font-size:13px;color:#51666a}
.dn-btn{flex:1;border:0;border-radius:99px;height:50px;padding:0 18px;font:inherit;font-weight:700;font-size:16px;cursor:pointer;background:linear-gradient(180deg,var(--gold-l),var(--gold));color:#1b2b2d;box-shadow:0 10px 24px rgba(196,162,74,.45);transition:transform .2s,opacity .2s;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.dn-btn:active{transform:scale(.97)}
.dn-btn:disabled{opacity:.55;cursor:wait}
.dn-back{display:block;width:100%;margin-top:12px;border:0;background:transparent;color:var(--teal);font:inherit;font-weight:600;font-size:15px;padding:10px;cursor:pointer}
.dn-err{display:none;margin-top:16px;padding:13px 15px;border-radius:14px;background:#fdecea;color:#8a2a22;font-size:14.5px;font-weight:500}
#payel{margin:12px 0}
#exel{min-height:0}
.dn-or{display:flex;align-items:center;gap:10px;margin:16px 0 6px;color:#7f9396;font-size:12.5px;font-weight:600}
.dn-or::before,.dn-or::after{content:"";flex:1;height:1px;background:#dbe6e6}
.dn-paysum{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#f1f7f7;border:1px solid #dbe8e8;border-radius:14px;padding:11px 14px;margin:2px 0 6px;font-weight:600;font-size:14px;color:#24505a}
.dn-paysum i{font-style:normal;font-size:12px;font-weight:700;color:#5b7377;white-space:nowrap}
.dn-diag{font-size:12px;font-weight:600;color:#7a5f14;background:#fff8e1;border:1px dashed #e6cf87;border-radius:10px;padding:6px 10px;margin:2px 0 8px}
.dn-secure{display:flex;gap:7px;align-items:flex-start;font-size:12.5px;color:#51666a;margin:12px 2px 0;line-height:1.4}
.dn-secure svg{flex:none;margin-top:1px;color:#2c8a5a}
.dn-test{font-size:12px;color:#7a5f14;background:#fff8e1;border:1px dashed #e6cf87;border-radius:12px;padding:8px 12px;margin:12px 0 0}
.dn-ok2{text-align:center;padding:10px 0 4px}
.dn-check{width:68px;height:68px;margin:6px auto 12px;border-radius:50%;background:linear-gradient(180deg,#38b27a,#1d8a5a);display:grid;place-items:center;box-shadow:0 12px 30px rgba(29,138,90,.4);animation:dnPop .6s cubic-bezier(.2,1.4,.4,1) both}
.dn-check svg{width:34px;height:34px}
@keyframes dnPop{from{transform:scale(.3);opacity:0}to{transform:none;opacity:1}}
.dn-ok2 h3{font-family:'Bree Serif',serif;font-weight:400;font-size:22px;color:#1d6b43;margin:0 0 4px}
.dn-ok2 .num{display:inline-block;background:#eef7f1;border:1px solid #bfe3cf;color:#1d6b43;font-weight:700;padding:6px 14px;border-radius:99px;margin:8px 0}
.dn-ok2 p{color:#3b5f50;font-size:14.5px;margin:4px 0}
.dn-thx{color:#51666a!important;font-size:14.5px;line-height:1.5;margin:2px 8px 16px!important}
.dn-recap{background:#f6faf9;border:1px solid #dbe9e6;border-radius:18px;padding:16px 18px 10px;text-align:left;margin:0 0 12px}
.dn-amt{font-family:'Bree Serif',serif;font-size:34px;color:var(--teal);text-align:center;margin-bottom:10px}
.dn-amt small{font-family:'Inter',sans-serif;font-size:15px;color:#51666a}
.dn-sr{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-top:1px solid #e1ecea;font-size:14px}
.dn-sr span{color:#6a7f83}.dn-sr b{color:#14272a;text-align:right;font-weight:600}
.dn-logo{display:block;height:130px;width:auto;margin:0 auto 6px}
.dn-ok2 .dn-check{width:52px;height:52px;margin:6px auto 10px}.dn-ok2 .dn-check svg{width:26px;height:26px}
.dn-mail{font-size:13.5px!important;line-height:1.55;color:#51666a!important;background:#f3f8f7;border-radius:14px;padding:12px 14px;margin:6px 0 4px!important;text-align:left}
.dn-mail b{color:#14272a}
.dn-dl{display:flex;align-items:center;justify-content:center;gap:9px}
.dn-esp{display:flex;align-items:center;justify-content:center;gap:8px;margin:14px 0 4px;color:var(--teal);font-weight:700;font-size:15px;text-decoration:none;padding:10px}
.dn-esp span{font-size:18px}
.dn-espn{font-size:12.5px!important;color:#8a9b9e!important;margin:0!important}
.dn-dl{display:block;margin:12px 0 0;padding:13px;border-radius:99px;font-weight:700;font-size:15px;text-decoration:none;background:var(--teal);color:#fff;text-align:center}
.dn-dl.g{background:linear-gradient(180deg,var(--gold-l),var(--gold));color:#1b2b2d}
/* récapitulatif (ordinateur) */
.dn-sum{position:sticky;top:84px;padding:22px 20px;overflow:hidden}
.dn-sum::before{content:"";position:absolute;left:0;right:0;top:0;height:6px;background:linear-gradient(90deg,var(--gold),var(--gold-l),var(--gold))}
.dn-sum h3{font-size:19px;color:var(--teal);margin:0 0 12px}
.dn-amt{font-family:'Bree Serif',serif;font-size:44px;color:var(--teal);line-height:1}
.dn-amt small{font-family:Inter,sans-serif;font-size:15px;color:#51666a;font-weight:600}
.dn-sum dl{margin:14px 0 0;display:grid;gap:9px}
.dn-sum dt{font-size:11.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--gold)}
.dn-sum dd{font-size:15px;font-weight:500;margin:0}
.dn-ok{margin-top:16px;padding-top:14px;border-top:1px solid #e3ecec;font-size:13.5px;color:#51666a}
.dn-ok p{margin:0 0 6px;display:flex;gap:8px}
.dn-ok span{color:#2c8a5a;font-weight:700}
.dn-legal{display:none;text-align:center;font-size:11.5px;color:#7f9396;margin:18px 12px 0;line-height:1.6}
.dn-legal a{color:#51666a;text-decoration:underline}
.dn-note{max-width:1040px;margin:22px auto 0;text-align:center;font-size:12.5px;color:#51666a;padding:0 16px}
/* autocomplétion des adresses */
.dn-ac{position:relative}
.dn-ac ul{position:absolute;z-index:40;left:0;right:0;top:100%;margin:6px 0 0;padding:6px;list-style:none;background:#fff;border:2px solid #d3e0e0;border-radius:18px;box-shadow:0 16px 38px rgba(20,60,66,.22);max-height:300px;overflow:auto}
.dn-ac li{padding:12px 13px;border-radius:12px;cursor:pointer;display:flex;flex-direction:column;gap:1px}
.dn-ac li b{font-weight:600;font-size:15.5px;color:#14272a}
.dn-ac li span{font-size:13px;color:#51666a}
.dn-ac li:hover,.dn-ac li.on{background:#f6ecd0}
.dn-ac small{display:block;font-size:11.5px;color:#7f9396;margin-top:5px}
/* chargement */
.dn-load{position:fixed;inset:0;z-index:2000;display:none;align-items:center;justify-content:center;background:rgba(20,76,82,.88);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px)}
.dn-load.on{display:flex}
.dn-load div{text-align:center;color:#fff;padding:0 24px}
.dn-load img{width:84px;height:84px;object-fit:contain;animation:dnSpin 1.6s linear infinite;filter:drop-shadow(0 6px 18px rgba(0,0,0,.35))}
.dn-load p{margin:14px 0 0;font-family:'Bree Serif',serif;font-size:21px;color:var(--gold-l)}
.dn-load small{display:block;opacity:.85;margin-top:4px;font-size:13px}
@keyframes dnSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.dn-load img,.dn-panel,.dn-check{animation:none}}
/* téléphone : vraiment une application */
@media(max-width:860px){
  .dn-grid{grid-template-columns:1fr}.dn-sum{display:none}
  #dn{padding:12px 0 18px}.dn-wrap{padding:0 12px}
  footer{display:none!important}
  #dn{padding-bottom:calc(96px + env(safe-area-inset-bottom))}
  .dn-legal{display:block}
  .dn-form{padding:14px 14px 16px;border-radius:22px}
  .dn-actions{position:fixed;z-index:700;left:0;right:0;bottom:0;margin:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:rgba(255,255,255,.94);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-top:1px solid #dbe6e6;box-shadow:0 -10px 30px rgba(20,60,66,.14)}
  .dn-btn{height:50px}
  .dn-h{font-size:20px}
}
@media(max-width:420px){.dn-g{grid-template-columns:1fr}.dn-tabs{width:100%}.dn-tab{flex:1;padding:10px 6px;font-size:13px}.dn-rand{width:100%}.dn-amts button{font-size:19px;height:54px}.dn-steps li{font-size:11.5px}}
"""
CSS = CSS + CSS_ACCT

HTML = r"""
<section id="dn"><div class="dn-wrap">
  <ol class="dn-steps" id="dnSteps"><i class="dn-fill" id="dnFill"></i><li>Votre don</li><li>Coordonnées</li><li id="dnS3">Paiement</li></ol>
  <div class="dn-acct" id="acct">
    <div id="acctOut" class="dn-acct-out"><span>Déjà donateur ?</span><button type="button" id="acctOpen" class="dn-link">Se connecter</button><span>pour remplir le formulaire automatiquement</span></div>
    <div id="acctBox" class="dn-acct-box" hidden>
      <button type="button" id="acctClose" class="dn-x" aria-label="Fermer">✕</button><div class="dn-acct-h"><span class="dn-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 8 8 6 8-6"/></svg></span><b>Se connecter</b></div>
      <p class="dn-acct-p">Un code à 6 chiffres vous est envoyé par email. Pas de mot de passe : votre compte se crée à la première connexion.</p>
      <div id="lgStep1"><div class="dn-row"><input id="lgEmail" type="email" inputmode="email" autocomplete="email" placeholder="Votre adresse email" aria-label="Votre adresse email"><button type="button" id="lgSend" class="dn-btn sm">Recevoir mon code</button></div></div>
      <div id="lgStep2" hidden><p class="dn-acct-p">Code envoyé à <b id="lgTo"></b> · <button type="button" class="dn-link" id="lgChange">changer d'email</button></p>
        <label for="lgCode">Code à 6 chiffres</label><input id="lgCode" class="dn-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······">
        <p class="dn-sub"><button type="button" class="dn-link" id="lgResend">Renvoyer le code</button> <span id="lgDev"></span></p></div>
      <p class="dn-acct-err" id="lgErr" hidden></p>
    </div>
    <div id="acctIn" class="dn-acct-in" hidden><span class="dn-av">✓</span><div><b id="acctEmail"></b><small>Connecté · <a href="/espace/">Mon espace donateur</a> · <button type="button" class="dn-link" id="acctLogout">Se déconnecter</button></small></div></div>
  </div>
  <div class="dn-grid">
  <form id="f" class="dn-card dn-form" novalidate autocomplete="on">
    <div class="dn-tools">
      <button class="dn-rand" id="rand" type="button">🎲 Données au hasard</button>
    </div>

    <div class="dn-panel on" id="p1">
      <h2 class="dn-h" id="h1">Votre don</h2>
      <p class="dn-p" id="fs">Chaque don compte. Votre reçu fiscal vous est envoyé par email.</p>
      <div class="dn-lab first">1 · Pour quoi souhaitez-vous donner ?</div>
      <div class="dn-chips" id="chips" role="radiogroup" aria-label="Affectation du don"></div>
      <input type="hidden" id="aff">
      <div id="actBox" hidden>
        <div class="dn-lab" id="actLab">2 · Comment souhaitez-vous participer ?</div>
        <div id="acts"></div>
        <div class="dn-actfree"><label for="libre">Ajouter un don libre <small>facultatif</small></label><div class="dn-other"><input id="libre" inputmode="decimal" placeholder="Montant libre" aria-label="Don libre"><span>€</span></div></div>
        <div class="dn-acttotal"><span>Total</span><b id="actTotal">0 €</b></div>
      </div>
      <div id="amtBox">
      <div class="dn-lab">2 · Quel montant ?</div>
      <div class="dn-amts" id="amts"><button type="button" data-v="26">26 €</button><button type="button" data-v="52">52 €</button><button type="button" data-v="126">126 €</button><button type="button" data-v="252">252 €</button><button type="button" data-v="770">770 €</button><button type="button" data-v="1540">1 540 €</button></div>
      <div class="dn-other"><input id="montant" inputmode="decimal" placeholder="Autre montant" aria-label="Autre montant"><span>€</span></div>
      </div>
      <div id="gFreq">
        <div class="dn-lab">3 · Une fois ou chaque mois ?</div>
        <div class="dn-freq"><label><input type="radio" name="freq" value="ponctuel" checked><span>Ponctuel</span></label><label><input type="radio" name="freq" value="mensuel"><span>Mensuel</span></label></div>
        <p class="dn-sub" id="freqHint" style="display:none">Prélèvement chaque mois, jusqu'à ce que vous l'arrêtiez. Un reçu fiscal est établi pour chaque prélèvement.</p>
      </div>
      <div id="gSans" style="display:none">
        <div class="dn-lab">Le versement reçu</div>
        <div class="dn-g">
          <div><label for="mode">Mode de versement</label><select id="mode"><option>Virement bancaire</option><option>Chèque</option><option>Espèces</option></select></div>
          <div><label for="dt">Date du don</label><input id="dt" type="date"></div>
        </div>
      </div>
    </div>

    <div class="dn-panel" id="p2">
      <h2 class="dn-h">Vos coordonnées</h2>
      <p class="dn-p">Elles figurent sur votre reçu fiscal.</p>
      <div class="dn-profs" id="profSwitch"><div class="dn-lab" style="margin-top:0">Je donne avec mon profil</div><div class="dn-pcards" id="profCards"></div></div>
      <div class="dn-type">
        <label><input type="radio" name="type" value="particulier" checked><span>Particulier<small>je donne en mon nom</small></span></label>
        <label><input type="radio" name="type" value="entreprise"><span>Professionnel<small>entreprise, association…</small></span></label>
      </div>
      <p class="dn-hint" id="profHint" hidden></p>
      <div class="dn-g">
        <div id="gPart" class="dn-full dn-g" style="padding:0">
          <div><label for="prenom">Prénom</label><input id="prenom" autocomplete="given-name"></div>
          <div><label for="nom">Nom</label><input id="nom" autocomplete="family-name"></div>
        </div>
        <div id="gEnt" class="dn-full dn-g" style="padding:0;display:none">
          <div class="dn-full"><label for="siret">Numéro SIRET <span style="font-weight:400;color:#51666a">(ou SIREN)</span></label><input id="siret" inputmode="numeric" autocomplete="off" placeholder="14 chiffres : tout se remplit tout seul"><small id="siretMsg" class="dn-siretmsg"></small></div>
          <div><label for="rs">Raison sociale</label><input id="rs" autocomplete="organization"></div>
          <div><label for="siren">SIREN</label><input id="siren" inputmode="numeric" placeholder="9 chiffres"></div>
        </div>
        <div class="dn-full dn-ac">
          <label for="adr">Adresse</label>
          <input id="adr" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="adrList" autocomplete="off" placeholder="Commencez à taper votre adresse…">
          <ul id="adrList" role="listbox" hidden></ul>
          <small>Suggestions issues de la Base Adresse Nationale (Géoplateforme, IGN).</small>
        </div>
        <div><label for="cp">Code postal</label><input id="cp" inputmode="numeric" maxlength="5" autocomplete="postal-code"></div>
        <div><label for="ville">Ville</label><input id="ville" autocomplete="address-level2"></div>
        <div class="dn-full"><label for="email">Email (pour recevoir votre reçu)</label><input id="email" type="email" autocomplete="email" inputmode="email"></div>
        <div class="dn-full dn-guestsave" id="guestSave"><span>Pour retrouver ces informations la prochaine fois, <button type="button" class="dn-link" id="guestLogin">connectez-vous</button> (un code par email, sans mot de passe).</span></div>
        <div class="dn-full dn-savep"><label class="dn-ck"><input id="saveProf" type="checkbox" checked><span>Enregistrer ces informations dans mon espace donateur<small>Pour ne plus avoir à les retaper</small></span></label></div>
        <div class="dn-full" id="envRow"><label class="dn-ck"><input id="env" type="checkbox" checked><span>Envoyer le reçu fiscal par email</span></label></div>
      </div>
    </div>

    <div class="dn-panel" id="p3">
      <h2 class="dn-h">Paiement sécurisé</h2>
      <p class="dn-diag" id="exDiag" hidden>Portefeuilles (Apple Pay / Google Pay) : détection en cours…</p>
      <div class="dn-paysum"><span id="paySum">—</span><i>🔒 Stripe</i></div>
      <div id="exwrap" style="display:none">
        <div class="dn-lab" style="margin-top:6px">Paiement express</div>
        <div id="exel"></div>
        <div class="dn-or"><span>ou par carte bancaire</span></div>
      </div>
      <div class="dn-lab" id="cardLab" style="margin-top:6px">Carte bancaire</div>
      <div id="payel"></div>
      <p class="dn-secure"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg> Paiement chiffré par Stripe : vos données bancaires ne passent jamais par nos serveurs.</p>
      <p class="dn-test">Mode test : carte <b>4242 4242 4242 4242</b> · date future · CVC <b>123</b></p>
    </div>

    <div class="dn-panel" id="p4"><div class="dn-ok2" id="res" aria-live="polite"></div></div>

    <div class="dn-err" id="err" role="alert"></div>
    <div class="dn-actions" id="bar">
      <div class="dn-bamt" id="bamt"><small>Votre don</small><b id="bAmt">—</b></div>
      <button class="dn-btn" id="go" type="button">Continuer</button>
    </div>
    <button class="dn-back" id="back" type="button" hidden>← Retour</button>
  </form>

  <aside class="dn-card dn-sum" aria-label="Récapitulatif">
    <h3>Votre don</h3>
    <div class="dn-amt" id="sAmt">— <small></small></div>
    <dl>
      <div><dt>Affectation</dt><dd id="sAff">—</dd></div>
      <div><dt>Donateur</dt><dd id="sWho">—</dd></div>
      <div><dt>Bénéficiaire</dt><dd>Émounatéha · association d'intérêt général</dd></div>
    </dl>
    <div class="dn-ok">
      <p><span>✓</span> Reçu fiscal CERFA en PDF par email</p>
      <p><span>✓</span> Paiement sécurisé par Stripe</p>
      <p><span>✓</span> Aucun compte à créer</p>
    </div>
  </aside>
  </div>
</div>
<p class="dn-legal">Émounatéha · association déclarée · SIREN 930 755 558<br><a href="http://localhost:3000/mentions-legales/">Mentions légales</a> · <a href="http://localhost:3000/cgv/">CGV</a></p>
<div class="dn-load" id="dnLoad" role="status" aria-live="polite"><div><img src="/logo.png" alt=""><p id="dnLoadTxt">Un instant…</p><small>Merci de patienter</small></div></div>
</section>
"""

JS = r"""
// ===== formulaire de don (test) : parcours en écrans =====
const $ = id => document.getElementById(id);
let cfg = {}, stripe = null, elements = null, clientSecret = '', mode = '@@MODE@@', busy = false, panel = 1, payAmount = 0, payMen = false;
const eur = c => (c / 100).toFixed(2).replace('.', ',') + ' €';
const nf = v => { const n = Number(String(v).replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; };
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const wait = ms => new Promise(r => setTimeout(r, ms));
const isEnt = () => document.querySelector('input[name=type]:checked').value === 'entreprise';
const isMen = () => document.querySelector('input[name=freq]:checked').value === 'mensuel' && mode === 'carte';
const money = v => v.toFixed(2).replace('.00', '').replace('.', ',') + ' €';

function show(m) { const e = $('err'); e.textContent = m; e.style.display = m ? 'block' : 'none'; if (m) e.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
async function withLoad(txt, fn) { $('dnLoadTxt').textContent = txt; $('dnLoad').classList.add('on'); const t0 = Date.now(); try { return await fn(); } finally { const d = 650 - (Date.now() - t0); if (d > 0) await wait(d); $('dnLoad').classList.remove('on'); } }

// écrans
function goPanel(n) {
  panel = n; show('');
  if ($('acct')) $('acct').style.display = n === 4 ? 'none' : '';
  [1, 2, 3, 4].forEach(i => $('p' + i).classList.toggle('on', i === n));
  const li = document.querySelectorAll('#dnSteps li');
  li.forEach((x, i) => { const k = i + 1; x.className = n === 4 || k < n ? 'done' : (k === n ? 'on' : ''); });
  $('dnFill').style.width = (n === 4 ? 68 : (n - 1) * 34) + '%';
  $('dnS3').textContent = mode === 'carte' ? 'Paiement' : 'Reçu';
  $('go').textContent = n === 1 ? 'Continuer' : n === 2 ? (mode === 'carte' ? 'Valider mon don' : 'Générer le reçu') : n === 3 ? 'Payer ' + eur(payAmount) : 'Nouveau don';
  $('back').hidden = n === 1 || n === 4; $('back').textContent = '← ' + (n === 3 ? 'Modifier mes informations' : 'Retour');
  document.querySelector('.dn-tools').style.display = n === 1 ? '' : 'none';
  $('bamt').style.display = n === 4 ? 'none' : '';
  $('dnSteps').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function upSum() {
  const v = nf($('montant').value), men = isMen();
  $('sAmt').innerHTML = v ? money(v) + ' <small>' + (men ? 'par mois' : '') + '</small>' : '— <small></small>';
  $('bAmt').innerHTML = v ? money(v) + (men ? ' <em>/ mois</em>' : '') : '—';
  $('sAff').textContent = $('aff').value || '—';
  const who = isEnt() ? $('rs').value.trim() : ($('prenom').value.trim() + ' ' + $('nom').value.trim()).trim();
  $('sWho').textContent = who || '—';
}
function mark() { document.querySelectorAll('#amts button').forEach(b => b.classList.toggle('on', b.dataset.v === $('montant').value.trim())); }
function setType(ent) { document.querySelector('input[name=type][value=' + (ent ? 'entreprise' : 'particulier') + ']').checked = true; $('gPart').style.display = ent ? 'none' : 'grid'; $('gEnt').style.display = ent ? 'grid' : 'none'; }

// affectation : cartes à toucher
const SV = p => '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
const ICONS = {
  heart: SV('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'),
  box: SV('<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>'),
  home: SV('<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>'),
  work: SV('<rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'),
  book: SV('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'),
  cap: SV('<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>'),
  chat: SV('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/><path d="M9 11.5c0-1 .8-1.7 1.6-1.7.6 0 1 .3 1.4.8.4-.5.8-.8 1.4-.8.9 0 1.6.7 1.6 1.7 0 1.6-3 3.2-3 3.2s-3-1.6-3-3.2z"/>'),
  shirt: SV('<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>'),
  star: SV('<path d="m12 3 1.9 5.8H20l-4.9 3.6 1.9 5.8-5-3.6-5 3.6 1.9-5.8L4 8.8h6.1z"/>')
};
const ICONKEY = a => /colis/i.test(a) ? 'box' : /toit/i.test(a) ? 'home' : /soutien/i.test(a) ? 'chat' : /insertion/i.test(a) ? 'work' : /tement/i.test(a) ? 'shirt' : /scolarit/i.test(a) ? 'book' : /ducation/i.test(a) ? 'cap' : /kapparot|omer/i.test(a) ? 'star' : 'heart';
const splitLab = a => { const m = /^(.*?)\s*\((.*)\)\s*$/.exec(a); return m ? [m[1], m[2]] : [a, '']; };
let AFFITEMS = {};
const joursTxt = j => j <= 0 ? (j === 0 ? "aujourd'hui" : 'en cours') : (j === 1 ? 'demain' : 'dans ' + j + ' jours');
function buildChips(list) {
  list = (list || []).map(a => typeof a === 'string' ? { label: a, kind: 'base' } : a);
  AFFITEMS = {}; list.forEach(a => AFFITEMS[a.label] = a);
  $('chips').innerHTML = list.map((a, i) => {
    const [main, note] = splitLab(a.label), chk = i === 0 ? ' checked' : '';
    if (a.kind === 'fete') {
      const sub = a.montant ? 'Un colis de fête pour une famille · ' + a.montant + ' €' : 'Participez à cette occasion';
      const ico = a.montant ? '<img src="/tuiles/colis.png" alt="">' : ICONS.star;
      return '<label class="dn-chip fete"><input type="radio" name="affr" value="' + esc(a.label) + '"' + chk + '><span><span class="dn-ic">' + ico + '</span><em><b class="dn-soon">' + esc(joursTxt(a.jours)) + '</b><br>' + esc(main) + (note ? ' <small style="display:inline">(' + esc(note) + ')</small>' : '') + '<small>' + sub + '</small></em><i></i></span></label>';
    }
    const extra = a.montant ? '<small>' + a.montant + ' €</small>' : (note ? '<small>' + esc(note) + '</small>' : '');
    return '<label class="dn-chip"><input type="radio" name="affr" value="' + esc(a.label) + '"' + chk + '><span><span class="dn-ic">' + ICONS[ICONKEY(a.label)] + '</span><em>' + esc(main) + extra + '</em><i></i></span></label>';
  }).join('');
  document.querySelectorAll('input[name=affr]').forEach(r => r.onchange = () => applyAff(true));
  applyAff(false);
}
// applique le choix : texte envoyé au serveur, choix Chabbat / fête pour les colis, montant suggéré (seulement quand le donateur touche une carte)
let ACTS = {};              // actions cochées : { id: montant en texte }
const eurTxt = v => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
function actTotal() {
  let t = 0; Object.values(ACTS).forEach(v => t += eurTxt(v)); t += eurTxt($('libre').value);
  t = Math.round(t * 100) / 100;
  $('actTotal').textContent = t ? money(t) : '0 €';
  $('montant').value = t ? String(t).replace('.', ',') : ''; upSum();
}
function renderActs(it) {
  ACTS = {}; $('libre').value = '';
  $('actLab').textContent = '2 · Comment souhaitez-vous participer ?';
  $('acts').innerHTML = it.actions.map(a => {
    const on = (it.defaut || []).includes(a.id); if (on) ACTS[a.id] = a.montant ? String(a.montant) : '';
    return '<div class="dn-act' + (on ? ' on' : '') + '" data-id="' + esc(a.id) + '"><label class="dn-actrow"><input type="checkbox"' + (on ? ' checked' : '') + '><span class="bx"></span><span class="tx"><b>' + esc(a.label) + '</b>' + (a.desc ? '<small>' + esc(a.desc) + '</small>' : '') + '</span></label>' +
      '<div class="dn-actamt"' + (on ? '' : ' hidden') + '><div class="dn-other"><input inputmode="decimal" placeholder="Montant libre" aria-label="Montant : ' + esc(a.court) + '" value="' + (on && a.montant ? a.montant : '') + '"><span>€</span></div><div class="dn-actq">' +
      (a.montant ? [1, 2, 3, 5] : [10, 20, 50, 100]).map(n => { const v = a.montant ? a.montant * n : n; return '<button type="button" data-v="' + v + '">' + (a.montant ? n + ' × ' : '') + v + ' €</button>'; }).join('') + '</div></div></div>';
  }).join('');
  document.querySelectorAll('#acts .dn-act').forEach(box => {
    const id = box.dataset.id, a = it.actions.find(x => x.id === id), cb = box.querySelector('input[type=checkbox]'), inp = box.querySelector('.dn-actamt input'), amt = box.querySelector('.dn-actamt');
    const sync = () => { box.querySelectorAll('.dn-actq button').forEach(b => b.classList.toggle('on', b.dataset.v === inp.value.trim())); };
    cb.onchange = () => { box.classList.toggle('on', cb.checked); amt.hidden = !cb.checked; if (cb.checked) { if (!inp.value && a.montant) inp.value = a.montant; ACTS[id] = inp.value; if (!inp.value) setTimeout(() => inp.focus(), 50); } else delete ACTS[id]; sync(); actTotal(); };
    inp.oninput = () => { ACTS[id] = inp.value; sync(); actTotal(); };
    box.querySelectorAll('.dn-actq button').forEach(b => b.onclick = () => { inp.value = b.dataset.v; ACTS[id] = inp.value; sync(); actTotal(); });
    sync();
  });
  $('libre').oninput = actTotal; actTotal();
}
function applyAff(suggest) {
  const r = document.querySelector('input[name=affr]:checked'); if (!r) return; const it = AFFITEMS[r.value] || { label: r.value };
  $('aff').value = it.label;
  const fete = it.kind === 'fete' && it.actions && it.actions.length && mode !== 'sans';
  $('actBox').hidden = !fete; $('amtBox').hidden = !!fete; $('gFreq').style.display = fete ? 'none' : '';
  if (fete) { if ($('actBox').dataset.for !== it.label || suggest) { $('actBox').dataset.for = it.label; renderActs(it); } document.querySelector('input[name=freq][value=ponctuel]').checked = true; $('freqHint').style.display = 'none'; }
  else { $('actBox').dataset.for = ''; if (suggest && it.montant) { $('montant').value = String(it.montant); mark(); } }
  upSum();
}
function pickAff(i) { const r = document.querySelectorAll('input[name=affr]')[i]; if (r) { r.checked = true; applyAff(false); } }

// données au hasard (test)
const R = a => a[Math.floor(Math.random() * a.length)];
const ascii = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
function sirenRandom() { const d = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)); let sum = 0; for (let i = 0; i < 8; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9; } sum += x; } for (let c = 0; c < 10; c++) if ((sum + c) % 10 === 0) return d.join('') + c; return '930755558'; }
function fillRandom() {
  const ent = Math.random() < 0.25, rue = R([['14 rue des Rosiers', '75004', 'Paris'], ['28 boulevard Félix Faure', '93300', 'Aubervilliers'], ['5 avenue Victor Hugo', '93300', 'Aubervilliers'], ['12 rue de la Paix', '75002', 'Paris'], ['7 cours de Vincennes', '75020', 'Paris'], ['31 avenue de Paris', '94300', 'Vincennes']]);
  const pr = R(['Esther', 'David', 'Sarah', 'Daniel', 'Léa', 'Nathan', 'Hanna', 'Samuel', 'Rachel', 'Jonathan']), nm = R(['Martin', 'Bernard', 'Dubois', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Lefebvre', 'Garcia', 'Roux']);
  setType(ent); $('prenom').value = pr; $('nom').value = nm; $('rs').value = R(['Boulangerie Martin SARL', 'Cabinet Dubois & Associés', 'Garage Moreau', 'Épicerie du Marais SAS']); $('siren').value = ent ? sirenRandom() : '';
  $('adr').value = rue[0]; $('cp').value = rue[1]; $('ville').value = rue[2]; $('email').value = ascii(pr) + '.' + ascii(nm) + '@example.com';
  $('montant').value = String(R([26, 52, 126, 252, 770, 1540])); mark();
  const men = Math.random() < 0.3; document.querySelector('input[name=freq][value=' + (men ? 'mensuel' : 'ponctuel') + ']').checked = true; $('freqHint').style.display = men ? 'block' : 'none';
  pickAff(Math.floor(Math.random() * document.querySelectorAll('input[name=affr]').length));
  const m = $('mode'); m.selectedIndex = Math.floor(Math.random() * m.options.length); upSum();
}

const cfgP = fetch('/api/config').then(r => r.json()).then(c => {
  cfg = c; buildChips(c.affectations || []);
  if (mode === 'carte') { $('env').checked = true; $('envRow').style.display = 'none'; }   // le reçu est toujours envoyé par email aux donateurs
  if (mode === 'sans' || /[?&]test=1/.test(location.search)) { document.body.classList.add('test-on'); fillRandom(); } else { $('montant').value = '52'; mark(); upSum(); }
  pickAff(0);   // la 1re carte (la fête qui approche, sinon « là où le besoin est le plus grand ») est cochée par défaut
  if (mode === 'carte') loadMe().then(() => { if (me) afterLogin(); }); if (mode === 'carte') ensureStripe().catch(() => {});   // préchargement de Stripe
  return c;
});
// Stripe.js : chargé à la demande, et on attend qu'il soit prêt avant d'ouvrir le paiement
let stripeP = null;
function ensureStripe() {
  if (stripe) return Promise.resolve(stripe);
  if (!stripeP) stripeP = cfgP.then(c => new Promise((res, rej) => {
    if (!c.publishableKey) return rej(new Error('Clé Stripe publique manquante (.env)'));
    const init = () => { try { stripe = Stripe(c.publishableKey); res(stripe); } catch (e) { rej(e); } };
    if (window.Stripe) return init();
    const sc = document.createElement('script'); sc.src = 'https://js.stripe.com/v3/'; sc.onload = init;
    sc.onerror = () => rej(new Error('Stripe.js n\'a pas pu se charger (connexion Internet ?)'));
    document.head.appendChild(sc);
  }));
  return stripeP.catch(e => { stripeP = null; throw e; });
}
$('dt').value = new Date().toISOString().slice(0, 10); $('dt').max = $('dt').value;
$('rand').onclick = () => { fillRandom(); show(''); };

function setMode(m) {
  mode = m;
  $('gSans').style.display = m === 'sans' ? 'block' : 'none'; $('gFreq').style.display = m === 'carte' ? '' : 'none';
  $('fs').textContent = m === 'carte' ? 'Chaque don compte. Votre reçu fiscal vous est envoyé par email.' : 'Pour un don déjà reçu par virement, chèque ou espèces : le reçu CERFA est généré directement.';
  $('h1').textContent = m === 'carte' ? 'Choisissez votre don' : 'Don reçu';
  upSum(); goPanel(1);
}
document.querySelectorAll('input[name=type]').forEach(r => r.onchange = () => { setType(isEnt()); updHint(); upSum(); });
document.querySelectorAll('input[name=freq]').forEach(r => r.onchange = () => { $('freqHint').style.display = isMen() ? 'block' : 'none'; upSum(); });
$('amts').onclick = e => { const b = e.target.closest('button'); if (!b) return; $('montant').value = b.dataset.v; mark(); upSum(); };
['montant', 'prenom', 'nom', 'rs', 'adr', 'cp', 'ville', 'email'].forEach(i => $(i).addEventListener('input', () => { if (i === 'montant') mark(); upSum(); }));


// ===== compte donateur : connexion par code, profils particulier / professionnel =====
let me = null, lgEmail = '', resendAt = 0;
async function api(m, u, b) { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined, credentials: 'same-origin' }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Erreur ' + r.status); return j; }
const lgShowErr = m => { const e = $('lgErr'); e.textContent = m || ''; e.hidden = !m; };
const PROFNAME = k => k === 'pro' ? 'Professionnel' : 'Particulier';
const profLine = (k, p) => !p ? 'Ajouter ce profil' : (k === 'pro' ? p.raisonSociale : (p.prenom + ' ' + p.nom));
function fillProfile(k) {
  const p = me && me.profiles && me.profiles[k], ent = k === 'pro'; setType(ent);
  $('prenom').value = p && !ent ? p.prenom : ''; $('nom').value = p && !ent ? p.nom : ''; $('rs').value = p && ent ? p.raisonSociale : ''; $('siren').value = p && ent ? (p.siren || '') : ''; $('siret').value = ''; $('siretMsg').textContent = '';
  $('adr').value = p ? p.adresse : ''; $('cp').value = p ? p.cp : ''; $('ville').value = p ? p.ville : '';
  if (me) { $('email').value = me.email; }
  renderProfiles(); upSum();
}
let siretSeq = 0;
async function siretLookup() {
  const q = $('siret').value.replace(/\s/g, ''), m = $('siretMsg'), n = ++siretSeq;
  m.className = 'dn-siretmsg'; m.textContent = '';
  if (!/^(\d{9}|\d{14})$/.test(q)) { if (q.length > 0 && !/^\d+$/.test(q)) { m.className = 'dn-siretmsg ko'; m.textContent = 'Chiffres uniquement.'; } return; }
  m.textContent = 'Recherche de votre entreprise…';
  try {
    const r = await fetch('/api/siret?q=' + q), j = await r.json(); if (n !== siretSeq) return;
    if (!r.ok) throw new Error(j.error || 'Introuvable');
    $('rs').value = j.nom; $('siren').value = j.siren; if (j.adresse) $('adr').value = j.adresse; if (j.cp) $('cp').value = j.cp; if (j.ville) $('ville').value = j.ville;
    m.className = 'dn-siretmsg ok'; m.textContent = '✓ ' + j.nom + ' — vérifiez et modifiez si besoin.'; upSum();
  } catch (e) { if (n !== siretSeq) return; m.className = 'dn-siretmsg ko'; m.textContent = e.message + ' Vous pouvez remplir les champs à la main.'; }
}
$('siret').addEventListener('input', siretLookup);
function updHint() {
  const h = $('profHint'), k = isEnt() ? 'pro' : 'particulier', saved = me && me.profiles && me.profiles[k];
  let t = '';
  if (me && !saved) t = k === 'pro' ? 'Complétez votre profil professionnel (raison sociale, SIREN, adresse). Il sera enregistré pour vos prochains dons.' : 'Complétez votre profil particulier. Il sera enregistré pour vos prochains dons.';
  else if (!me && k === 'pro') t = 'Renseignez les informations de votre structure : elles figureront sur le reçu fiscal.';
  h.textContent = t; h.hidden = !t;
}
function curKind() { return isEnt() ? 'pro' : 'particulier'; }
function renderProfiles() {
  updHint();
  if (!me) return;
  const cur = curKind();
  $('profCards').innerHTML = ['particulier', 'pro'].map(k => { const p = me.profiles && me.profiles[k]; return '<button type="button" class="dn-pcard' + (cur === k ? ' on' : '') + (p ? '' : ' add') + '" data-k="' + k + '"><span class="ic">' + (k === 'pro' ? '🏢' : '👤') + '</span><span style="min-width:0"><b>' + PROFNAME(k) + '</b><small>' + esc(profLine(k, p)) + '</small></span></button>'; }).join('');
  document.querySelectorAll('#profCards .dn-pcard').forEach(b => b.onclick = () => fillProfile(b.dataset.k));
}
function renderAcct() {
  updHint();
  $('f').classList.toggle('dn-conn', !!me);
  $('acctOut').hidden = !!me; $('acctIn').hidden = !me; if (me) { $('acctBox').hidden = true; $('acctEmail').textContent = me.email; }
  $('email').readOnly = !!me; if (me) $('email').value = me.email;
  if (me) renderProfiles();
}
async function loadMe() { try { me = await api('GET', '/api/me'); } catch (e) { me = null; } renderAcct(); }
function afterLogin() {
  const k = (me.last && me.profiles[me.last]) ? me.last : (me.profiles.particulier ? 'particulier' : (me.profiles.pro ? 'pro' : 'particulier'));
  fillProfile(k); renderAcct(); show('');
}
async function lgRequest() {
  const em = $('lgEmail').value.trim().toLowerCase(); lgShowErr('');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) return lgShowErr('Adresse email invalide.');
  $('lgSend').disabled = true;
  try { const j = await api('POST', '/api/auth/request', { email: em }); lgEmail = em; resendAt = Date.now() + 30000; $('lgStep1').hidden = true; $('lgStep2').hidden = false; $('lgTo').textContent = em; $('lgCode').value = ''; $('lgCode').focus();
    $('lgDev').textContent = j.devCode ? '(mode test : code ' + j.devCode + ')' : ''; if (j.devCode) { $('lgCode').value = j.devCode; lgVerify(); } }
  catch (e) { lgShowErr(e.message); } finally { $('lgSend').disabled = false; }
}
async function lgVerify() {
  const code = $('lgCode').value.replace(/\D/g, ''); if (code.length !== 6) return; lgShowErr('');
  try { await api('POST', '/api/auth/verify', { email: lgEmail, code }); await loadMe(); afterLogin(); }
  catch (e) { lgShowErr(e.message); $('lgCode').select(); }
}
$('guestLogin').onclick = () => { $('acctOpen').click(); try { $('acct').scrollIntoView({ block: 'center' }); } catch (e) {} };
$('acctOpen').onclick = () => { $('acctBox').hidden = false; $('acctOut').hidden = true; $('lgStep1').hidden = false; $('lgStep2').hidden = true; lgShowErr(''); $('lgEmail').focus(); };
$('acctClose').onclick = () => { $('acctBox').hidden = true; $('acctOut').hidden = !!me; };
$('lgSend').onclick = lgRequest; $('lgEmail').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lgRequest(); } });
$('lgCode').addEventListener('input', () => { $('lgCode').value = $('lgCode').value.replace(/\D/g, '').slice(0, 6); if ($('lgCode').value.length === 6) lgVerify(); });
$('lgChange').onclick = () => { $('lgStep1').hidden = false; $('lgStep2').hidden = true; lgShowErr(''); $('lgEmail').focus(); };
$('lgResend').onclick = () => { const w = resendAt - Date.now(); if (w > 0) return lgShowErr('Patientez ' + Math.ceil(w / 1000) + ' s avant de redemander un code.'); $('lgEmail').value = lgEmail; lgRequest(); };
$('acctLogout').onclick = async () => { try { await api('POST', '/api/auth/logout'); } catch (e) {} me = null; renderAcct(); $('email').value = ''; };

// autocomplétion des adresses (Base Adresse Nationale, Géoplateforme IGN)
(function () {
  const inp = $('adr'), list = $('adrList'); let items = [], act = -1, t = null, ctl = null;
  const close = () => { list.hidden = true; list.innerHTML = ''; items = []; act = -1; inp.setAttribute('aria-expanded', 'false'); };
  const render = () => { list.innerHTML = items.map((it, i) => '<li role="option" data-i="' + i + '"' + (i === act ? ' class="on" aria-selected="true"' : '') + '><b>' + esc(it.rue) + '</b><span>' + esc(it.cp + ' ' + it.ville) + '</span></li>').join(''); list.hidden = !items.length; inp.setAttribute('aria-expanded', items.length ? 'true' : 'false'); };
  async function search(q) {
    if (ctl) ctl.abort(); ctl = new AbortController();
    try {
      const r = await fetch('https://data.geopf.fr/geocodage/search?autocomplete=1&limit=6&q=' + encodeURIComponent(q), { signal: ctl.signal }); const j = await r.json();
      items = (j.features || []).map(f => f.properties).filter(p => p.type === 'housenumber' || p.type === 'street').map(p => ({ rue: p.type === 'housenumber' ? p.housenumber + ' ' + p.street : p.name, cp: p.postcode, ville: p.city }));
      act = -1; render();
    } catch (e) { if (e.name !== 'AbortError') close(); }
  }
  function pick(it) { if (!it) return; inp.value = it.rue; $('cp').value = it.cp; $('ville').value = it.ville; close(); upSum(); }
  inp.addEventListener('input', () => { clearTimeout(t); const q = inp.value.trim(); if (q.length < 3) { close(); return; } t = setTimeout(() => search(q), 220); });
  inp.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); act = (act + 1) % items.length; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); act = (act - 1 + items.length) % items.length; render(); }
    else if (e.key === 'Enter' && act >= 0) { e.preventDefault(); pick(items[act]); }
    else if (e.key === 'Escape') close();
  });
  list.addEventListener('pointerdown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pick(items[+li.dataset.i]); } });
  inp.addEventListener('blur', () => setTimeout(close, 150));
})();

function body() {
  return { type: document.querySelector('input[name=type]:checked').value, prenom: $('prenom').value, nom: $('nom').value, raisonSociale: $('rs').value, siren: $('siren').value,
    adresse: $('adr').value, cp: $('cp').value, ville: $('ville').value, email: $('email').value, montant: $('montant').value,
    mode: $('mode').value, dateDon: $('dt').value, envoyerEmail: $('env').checked,
    frequence: document.querySelector('input[name=freq]:checked').value, affectation: $('aff').value, saveProfile: !!(me && $('saveProf').checked),
    ...(!$('actBox').hidden ? { lignes: Object.entries(ACTS).map(([id, m]) => ({ id, montant: m })), libre: $('libre').value } : {}) };
}
async function post(url, data) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Erreur ' + r.status); return j;
}
function check1() {
  if (!$('actBox').hidden) {
    const vide = Object.entries(ACTS).find(([, m]) => !(eurTxt(m) > 0)); if (vide) throw new Error('Indiquez un montant pour chaque action cochée.');
    if (!(nf($('montant').value) >= 1)) throw new Error('Cochez au moins une action ou ajoutez un don libre.');
    return;
  }
  if (nf($('montant').value) < 1) throw new Error('Choisissez un montant (1 € minimum).');
}
function check2() {
  if (isEnt() ? !$('rs').value.trim() : !($('prenom').value.trim() && $('nom').value.trim())) throw new Error(isEnt() ? 'Indiquez la raison sociale.' : 'Indiquez votre prénom et votre nom.');
  if (isEnt() && !/^\d{9}$/.test($('siren').value.replace(/\s/g, ''))) throw new Error('Indiquez le SIREN de votre structure (9 chiffres).');
  if ($('adr').value.trim().length < 3) throw new Error('Indiquez votre adresse.');
  if (!/^\d{5}$/.test($('cp').value.trim())) throw new Error('Code postal : 5 chiffres.');
  if ($('ville').value.trim().length < 2) throw new Error('Indiquez la ville.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test($('email').value.trim())) throw new Error('Email invalide.');
}

async function act() {
  if (busy) return; busy = true; $('go').disabled = true;
  try {
    if (panel === 1) { check1(); goPanel(2); }
    else if (panel === 2) {
      check2();
      if (mode === 'sans') { renderRes(await withLoad('Création de votre reçu fiscal…', () => post('/api/recu', body()))); }
      else {
        await withLoad('Connexion à Stripe…', ensureStripe);
        const j = await withLoad('Préparation du paiement sécurisé…', () => post('/api/intent', body()));
        payAmount = j.montant; payMen = j.mensuel;
        clientSecret = j.clientSecret;
        elements = stripe.elements({ clientSecret: j.clientSecret, fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' }], appearance: {
          theme: 'flat', labels: 'above',
          variables: { colorPrimary: '#1f6a72', colorText: '#14272a', colorTextSecondary: '#51666a', colorDanger: '#8a2a22', fontFamily: 'Inter, system-ui, sans-serif', fontSizeBase: '16px', borderRadius: '14px', spacingUnit: '4px', spacingGridRow: '14px', spacingGridColumn: '12px' },
          rules: { '.Input': { border: '2px solid #d3e0e0', backgroundColor: '#fff', padding: '13px 14px', boxShadow: 'none' }, '.Input:focus': { border: '2px solid #c4a24a', boxShadow: '0 0 0 4px rgba(196,162,74,0.22)' }, '.Input--invalid': { border: '2px solid #c0564b', boxShadow: 'none' }, '.Label': { fontWeight: '600', fontSize: '13px', color: '#24505a', marginBottom: '6px' }, '.Error': { fontSize: '13px' } } } });
        $('payel').innerHTML = ''; $('exel').innerHTML = ''; $('exwrap').style.display = 'none'; $('cardLab').style.display = '';
        $('paySum').textContent = money(payAmount / 100) + (payMen ? ' par mois' : '') + ' · ' + ($('aff').value || 'Don');
        elements.create('payment', { layout: { type: 'tabs' }, wallets: { applePay: 'never', googlePay: 'never' }, fields: { billingDetails: { name: 'never', email: 'never', address: 'never' } } }).mount('#payel');
        // Apple Pay / Google Pay : bouton express au-dessus de la carte (visible seulement si l'appareil et le domaine le permettent)
        const ex = elements.create('expressCheckout', { buttonType: { applePay: 'donate', googlePay: 'donate' }, buttonHeight: 48, layout: { maxColumns: 1, maxRows: 4 }, paymentMethods: { applePay: 'always', googlePay: 'always', link: 'never', paypal: 'never', amazonPay: 'never' } });
        ex.mount('#exel');
        ex.on('loaderror', ev => { $('exDiag').textContent = 'Erreur Apple Pay / Google Pay : ' + ((ev.error && (ev.error.message || ev.error.code)) || JSON.stringify(ev)); window.__exErr = ev; });
        setTimeout(() => { if (!window.__exReady && !window.__exErr) $('exDiag').textContent = 'Portefeuilles : aucune réponse de Stripe après 6 s'; }, 6000);
        ex.on('ready', ev => { const a = ev.availablePaymentMethods; window.__exReady = a || null; $('exDiag').textContent = 'Portefeuilles détectés : Apple Pay ' + (a && a.applePay ? '✓' : '✗') + ' · Google Pay ' + (a && a.googlePay ? '✓' : '✗') + ' · PayPal ' + (a && a.paypal ? '✓' : '✗') + (a ? '' : ' (aucun disponible sur cet appareil / ce navigateur)'); const ok = !!(a && (a.applePay || a.googlePay || a.paypal)); $('exwrap').style.display = ok ? 'block' : 'none'; $('cardLab').style.display = ok ? 'none' : ''; });
        ex.on('confirm', async () => {
          try {
            const { error, paymentIntent } = await stripe.confirmPayment({ elements, clientSecret, redirect: 'if_required', confirmParams: { return_url: location.href } });
            if (error) throw new Error(error.message || 'Paiement refusé');
            if (!paymentIntent || paymentIntent.status !== 'succeeded') throw new Error('Paiement non abouti');
            renderRes(await withLoad('Paiement reçu — création de votre reçu fiscal…', () => post('/api/finalize', { id: paymentIntent.id })));
          } catch (e) { show(e.message); }
        });
        goPanel(3);
        if (payMen) $('go').textContent = 'Payer ' + eur(payAmount) + ' · puis chaque mois';
      }
    }
    else if (panel === 3) {
      $('go').textContent = 'Paiement en cours…';
      const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: 'if_required', confirmParams: { return_url: location.href, payment_method_data: { billing_details: { name: isEnt() ? $('rs').value.trim() : ($('prenom').value.trim() + ' ' + $('nom').value.trim()), email: $('email').value.trim(), address: { line1: $('adr').value.trim(), postal_code: $('cp').value.trim(), city: $('ville').value.trim(), state: '', country: 'FR' } } } } });
      if (error) { $('go').textContent = 'Réessayer'; throw new Error(error.message || 'Paiement refusé'); }
      if (!paymentIntent || paymentIntent.status !== 'succeeded') { $('go').textContent = 'Réessayer'; throw new Error('Paiement non abouti (statut : ' + (paymentIntent && paymentIntent.status) + ')'); }
      renderRes(await withLoad('Paiement reçu — création de votre reçu fiscal…', () => post('/api/finalize', { id: paymentIntent.id })));
    }
    else if (panel === 4) { fillRandom(); goPanel(1); }
  } catch (e) { show(e.message); } finally { busy = false; $('go').disabled = false; }
}
$('go').onclick = act;
$('f').addEventListener('submit', e => { e.preventDefault(); act(); });
$('back').onclick = () => { elements = null; $('payel').innerHTML = ''; goPanel(panel === 3 ? 2 : 1); };

if (/[?&]diag=1/.test(location.search)) $('exDiag').hidden = false;
function renderRes(o) {
  const dev = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) || /[?&]diag=1/.test(location.search);
  const to = esc($('email').value.trim());
  const espace = me ? 'Vous pouvez aussi retrouver tous vos reçus directement depuis votre espace donateur.' : 'Vous pouvez aussi retrouver tous vos reçus fiscaux directement depuis votre espace donateur.';
  let em = '';
  if (o.email && o.email.error) em = '<b>L’email n’a pas pu être envoyé</b> (' + esc(o.email.error) + '). Téléchargez votre reçu ci-dessous. ' + espace;
  else if (o.email && !o.email.skipped) em = '<b>Nous vous avons envoyé un email</b> à ' + to + ', avec votre reçu fiscal (CERFA) en pièce jointe. Conservez-le : il vous sera demandé pour votre déclaration de revenus.<br><br>' + espace;
  else em = espace;
  const row = (k, v) => '<div class="dn-sr"><span>' + k + '</span><b>' + v + '</b></div>';
  $('res').innerHTML = '<img class="dn-logo" src="/logo-asso.png" alt="Émounatéha">' +
    '<h3>Merci pour votre don !</h3>' +
    '<p class="dn-thx">Votre générosité aide directement les familles que nous accompagnons.</p>' +
    '<div class="dn-recap"><div class="dn-amt">' + eur(o.montant) + (o.mensuel ? '<small> par mois</small>' : '') + '</div>' +
      (o.lignes && o.lignes.length ? o.lignes.map(l => row(esc(l.label), eur(l.montant))).join('') : (o.affectation ? row('Affectation', esc(o.affectation)) : '')) +
      row('Paiement', o.mensuel ? 'Don mensuel · 1re échéance' : 'Don ponctuel') +
      row('Reçu fiscal', 'n° ' + esc(o.numero)) + '</div>' +
    (em ? '<p class="dn-mail">' + em + '</p>' : '') +
    '<a class="dn-dl" href="' + o.pdf + '" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>Télécharger mon reçu fiscal</a>';
  $('res').insertAdjacentHTML('beforeend', me ? '<a class="dn-esp" href="/espace/">Voir tous mes reçus<span>→</span></a>' : '<a class="dn-esp" href="/espace/" id="ctaEspace">Retrouver tous mes reçus plus tard<span>→</span></a><p class="dn-espn">Connexion par code envoyé par email, sans mot de passe.</p>');
  if ($('ctaEspace')) $('ctaEspace').onclick = () => { try { sessionStorage.setItem('acctEmail', $('email').value.trim()); } catch (e) {} };
  goPanel(4); elements = null; $('payel').innerHTML = '';
}
setMode(mode);
// mode test : ?auto=pay avance seul jusqu'à l'écran de paiement
if (/[?&]auto=pay/.test(location.search)) cfgP.then(async () => { await wait(700); await act(); await wait(400); await act(); });
"""

ESP_HTML = r'''
<section id="dn"><div class="sp-wrap">
  <div id="spLogin" class="sp-card">
    <h2 class="dn-h" style="margin-top:0">Se connecter</h2>
    <p class="dn-p">Entrez votre email : vous recevez un code à 6 chiffres, sans mot de passe. Si vous n'avez pas encore d'espace donateur, il est créé à votre première connexion.</p>
    <div id="spS1"><label for="spEmail">Votre email</label><div class="dn-row"><input id="spEmail" type="email" inputmode="email" autocomplete="email"><button type="button" id="spSend" class="dn-btn sm">Recevoir mon code</button></div></div>
    <div id="spS2" hidden><p class="dn-acct-p">Code envoyé à <b id="spTo"></b> · <button type="button" class="dn-link" id="spChange">changer d'email</button></p>
      <label for="spCode">Code à 6 chiffres</label><input id="spCode" class="dn-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······">
      <p class="dn-sub"><button type="button" class="dn-link" id="spResend">Renvoyer le code</button> <span id="spDev"></span></p></div>
    <p class="dn-acct-err" id="spErr" hidden></p>
  </div>
  <div id="spApp" hidden>
    <div class="sp-card">
      <div class="sp-head"><span class="dn-av">✓</span><div><b id="spMail"></b><small>Espace donateur</small></div><div class="act"><a class="sp-pill gold" href="/">Faire un don</a><button class="sp-pill" id="spOut" type="button">Se déconnecter</button></div></div>
      <div class="sp-tabs"><button id="spT1" class="on" type="button">Mes reçus</button><button id="spT2" type="button">Mes informations</button></div>
      <div id="spRec"></div>
      <div id="spInf" hidden>
        <p class="sp-note" style="margin-top:0">Ces informations remplissent automatiquement le formulaire de don. Vous pouvez donner en tant que particulier, en tant que professionnel, ou les deux.</p>
        <form class="sp-form" id="fPart" novalidate><h4>👤 Profil particulier</h4>
          <div class="dn-g"><div><label for="pPrenom">Prénom</label><input id="pPrenom" autocomplete="given-name"></div><div><label for="pNom">Nom</label><input id="pNom" autocomplete="family-name"></div>
          <div class="dn-full"><label for="pAdr">Adresse</label><input id="pAdr" autocomplete="street-address"></div><div><label for="pCp">Code postal</label><input id="pCp" inputmode="numeric" maxlength="5"></div><div><label for="pVille">Ville</label><input id="pVille"></div></div>
          <div class="dn-actions-inline" style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="sp-pill gold" type="submit">Enregistrer</button><button class="sp-pill" type="button" id="delPart">Supprimer ce profil</button></div><p class="sp-ok" id="okPart" hidden></p><p class="dn-acct-err" id="erPart" hidden></p></form>
        <form class="sp-form" id="fPro" novalidate><h4>🏢 Profil professionnel</h4>
          <div class="dn-g"><div><label for="qRs">Raison sociale</label><input id="qRs" autocomplete="organization"></div><div><label for="qSiren">SIREN <span style="font-weight:400;color:#7f9396">(facultatif)</span></label><input id="qSiren" inputmode="numeric" maxlength="11"></div>
          <div class="dn-full"><label for="qAdr">Adresse du siège</label><input id="qAdr" autocomplete="street-address"></div><div><label for="qCp">Code postal</label><input id="qCp" inputmode="numeric" maxlength="5"></div><div><label for="qVille">Ville</label><input id="qVille"></div></div>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="sp-pill gold" type="submit">Enregistrer</button><button class="sp-pill" type="button" id="delPro">Supprimer ce profil</button></div><p class="sp-ok" id="okPro" hidden></p><p class="dn-acct-err" id="erPro" hidden></p></form>
      </div>
    </div>
  </div>
</div></section>
'''
ESP_JS = r'''
// ===== espace donateur =====
const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const eur = c => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
async function api(m, u, b) { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined, credentials: 'same-origin' }); const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || 'Erreur ' + r.status); e.status = r.status; throw e; } return j; }
let em = '', resendAt = 0, me = null;
const err = m => { const e = $('spErr'); e.textContent = m || ''; e.hidden = !m; };
async function request() {
  const v = $('spEmail').value.trim().toLowerCase(); err('');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return err('Adresse email invalide.');
  $('spSend').disabled = true;
  try { const j = await api('POST', '/api/auth/request', { email: v }); em = v; resendAt = Date.now() + 30000; $('spS1').hidden = true; $('spS2').hidden = false; $('spTo').textContent = v; $('spCode').value = ''; $('spCode').focus();
    $('spDev').textContent = j.devCode ? '(mode test : code ' + j.devCode + ')' : ''; if (j.devCode) { $('spCode').value = j.devCode; verify(); } }
  catch (e) { err(e.message); } finally { $('spSend').disabled = false; }
}
async function verify() { const code = $('spCode').value.replace(/\D/g, ''); if (code.length !== 6) return; err(''); try { await api('POST', '/api/auth/verify', { email: em, code }); await start(); } catch (e) { err(e.message); $('spCode').select(); } }
$('spSend').onclick = request; $('spEmail').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); request(); } });
$('spCode').addEventListener('input', () => { $('spCode').value = $('spCode').value.replace(/\D/g, '').slice(0, 6); if ($('spCode').value.length === 6) verify(); });
$('spChange').onclick = () => { $('spS1').hidden = false; $('spS2').hidden = true; err(''); $('spEmail').focus(); };
$('spResend').onclick = () => { const w = resendAt - Date.now(); if (w > 0) return err('Patientez ' + Math.ceil(w / 1000) + ' s avant de redemander un code.'); $('spEmail').value = em; request(); };
$('spOut').onclick = async () => { try { await api('POST', '/api/auth/logout'); } catch (e) {} location.reload(); };

function tab(n) { $('spT1').classList.toggle('on', n === 1); $('spT2').classList.toggle('on', n === 2); $('spRec').hidden = n !== 1; $('spInf').hidden = n !== 2; }
$('spT1').onclick = () => tab(1); $('spT2').onclick = () => tab(2);
const MOIS = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
function renderReceipts(data) {
  if (!data.receipts.length) { $('spRec').innerHTML = '<div class="sp-empty"><p style="margin:0 0 12px">Aucun reçu pour l\'instant.</p><a class="sp-pill gold" href="/">Faire un don</a></div>'; return; }
  const by = {}; data.receipts.forEach(r => (by[r.year] = by[r.year] || []).push(r));
  $('spRec').innerHTML = '<p class="sp-note" style="margin-top:0">Vos reçus fiscaux, classés par année. Conservez-les : ils vous sont demandés en cas de contrôle.</p>' +
    data.years.map(y => '<div class="sp-year"><div class="sp-yh"><h3>' + y.year + '</h3><span><b>' + y.count + ' reçu' + (y.count > 1 ? 's' : '') + '</b> · total <b>' + eur(y.total) + '</b></span></div>' +
      by[y.year].map(r => '<div class="sp-r"><div class="l"><b>' + esc(r.affectation || 'Don') + (r.mensuel ? '<span class="tag m">Mensuel' + (r.echeance ? ' n°' + r.echeance : '') + '</span>' : '') + '<span class="tag">' + (r.type === 'entreprise' ? 'Pro' : 'Particulier') + '</span></b><small>' + MOIS(r.date) + ' · ' + esc(r.mode.replace(/^Carte bancaire \(Stripe, test\)/, 'Paiement en ligne')) + ' · reçu n° ' + esc(r.numero) + '</small></div><div class="amt">' + eur(r.montant) + '</div><a class="sp-pill dl" href="' + r.pdf + '" target="_blank" rel="noopener">Télécharger le reçu (PDF)</a></div>').join('') + '</div>').join('');
}
function fillForms() {
  const p = (me.profiles || {}).particulier || {}, q = (me.profiles || {}).pro || {};
  $('pPrenom').value = p.prenom || ''; $('pNom').value = p.nom || ''; $('pAdr').value = p.adresse || ''; $('pCp').value = p.cp || ''; $('pVille').value = p.ville || '';
  $('qRs').value = q.raisonSociale || ''; $('qSiren').value = q.siren || ''; $('qAdr').value = q.adresse || ''; $('qCp').value = q.cp || ''; $('qVille').value = q.ville || '';
  $('delPart').hidden = !p.nom; $('delPro').hidden = !q.raisonSociale;
}
async function saveProfile(kind, data, ok, er) {
  const o = $(ok), e = $(er); o.hidden = true; e.hidden = true;
  try { const j = await api('PUT', '/api/me/profile', { kind, data }); me.profiles = j.profiles; fillForms(); o.textContent = '✓ Enregistré. Le formulaire de don se remplira avec ces informations.'; o.hidden = false; }
  catch (x) { e.textContent = x.message; e.hidden = false; }
}
$('fPart').addEventListener('submit', ev => { ev.preventDefault(); saveProfile('particulier', { prenom: $('pPrenom').value, nom: $('pNom').value, adresse: $('pAdr').value, cp: $('pCp').value, ville: $('pVille').value }, 'okPart', 'erPart'); });
$('fPro').addEventListener('submit', ev => { ev.preventDefault(); saveProfile('pro', { raisonSociale: $('qRs').value, siren: $('qSiren').value, adresse: $('qAdr').value, cp: $('qCp').value, ville: $('qVille').value }, 'okPro', 'erPro'); });
$('delPart').onclick = async () => { if (!confirm('Supprimer le profil particulier ? Vos reçus sont conservés.')) return; const j = await api('DELETE', '/api/me/profile/particulier'); me.profiles = j.profiles; fillForms(); };
$('delPro').onclick = async () => { if (!confirm('Supprimer le profil professionnel ? Vos reçus sont conservés.')) return; const j = await api('DELETE', '/api/me/profile/pro'); me.profiles = j.profiles; fillForms(); };

async function start() {
  try { me = await api('GET', '/api/me'); } catch (e) { $('spLogin').hidden = false; $('spApp').hidden = true; return; }
  $('spLogin').hidden = true; $('spApp').hidden = false; $('spMail').textContent = me.email; fillForms();
  try { renderReceipts(await api('GET', '/api/me/receipts')); } catch (e) { $('spRec').innerHTML = '<div class="sp-empty">Impossible de charger vos reçus : ' + esc(e.message) + '</div>'; }
}
try { const pre = sessionStorage.getItem('acctEmail'); if (pre) { $('spEmail').value = pre; sessionStorage.removeItem('acctEmail'); } } catch (e) {}
start();
'''

def build(variant="don"):
    s = src
    # SEO : page de test, jamais indexée
    s = re.sub(r'<!-- seo:start -->.*?<!-- seo:end -->', '<meta name="robots" content="noindex,nofollow">', s, flags=re.S)
    adm = variant == 'admin'; esp = variant == 'espace'
    s = re.sub(r'<title>.*?</title>', '<title>%s · Émounatéha</title>' % ('Back-office — reçu sans paiement' if adm else ('Mon espace donateur' if esp else 'Faire un don')), s, count=1, flags=re.S)
    s = re.sub(r'<meta name="description"[^>]*>', '', s, count=1)
    s = re.sub(r'<meta name="theme-color"[^>]*>', '', s)
    s = s.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="theme-color" content="#ffffff">', 1)
    s = s.replace('<script src="/apercu-video.js?v=3" defer></script>', '')
    # liens du menu et du pied de page -> site local (port 3000)
    def loc(m): return m.group(0).replace('href="/', 'href="%s/' % LOCAL)
    s = re.sub(r'<nav class="sec-nav".*?</nav>', loc, s, count=1, flags=re.S)
    s = re.sub(r'<footer>.*?</footer>', loc, s, count=1, flags=re.S)
    # en-tête de page
    head = re.search(r'<header class="pagehead">.*?</header>', s, re.S).group(0)
    if esp:
        s = s.replace(head, '<header class="pagehead"><div class="wrap"><h1>Mon espace donateur</h1><p>Retrouvez vos reçus fiscaux, classés par année, et vos informations.</p></div></header>')
    else:
        s = s.replace(head, ('<header class="pagehead"><div class="wrap"><h1>Reçu sans paiement</h1><p>Back-office : générez le reçu fiscal CERFA d\'un don reçu par virement, chèque ou espèces.</p><span class="dn-pill">Back-office · mode test</span></div></header>' if adm else '<header class="pagehead"><div class="wrap"><h1>Faire un don</h1><p>Votre reçu fiscal CERFA vous est envoyé par email, en PDF, dès votre don.</p><span class="dn-pill">Mode test · aucun argent réel</span></div></header>'))
    # contenu
    a = s.index('<section id="colis">'); b = s.index('</section>', a) + len('</section>')
    s = s[:a] + (ESP_HTML if esp else HTML) + s[b:]
    if adm: s = s.replace('<div class="dn-acct" id="acct">', '<div class="dn-acct" id="acct" style="display:none">')   # pas de connexion donateur dans le back-office
    # script principal : partie commune du site (date, barre au défilement…) + formulaire + menu
    sa = s.index("<script>document.getElementById('y')"); sb = s.index('</script>', sa) + len('</script>')
    p0 = src.index("<script>document.getElementById('y')"); p1 = src.index('const UBER=', p0)
    nav_a = src.index("(function(){const nav=document.querySelector('.sec-nav')"); nav_b = src.index('</script>', nav_a)
    s = s[:sa] + src[p0:p1] + (ESP_JS if esp else JS.replace('@@MODE@@', 'sans' if adm else 'carte')) + '\n' + src[nav_a:nav_b] + '</script>' + s[sb:]
    s = s.replace('</head>', '<style>%s</style>\n</head>' % CSS, 1)
    out = os.path.join(HERE, 'public', 'backoffice' if adm else ('espace' if esp else ''), 'index.html')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w', encoding='utf-8').write(s)
    print('page construite :', out.replace(HERE, '.'), len(s), 'octets')

build('don')
build('admin')
build('espace')
