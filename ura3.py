"""
#spremenljivke
#Številske spremenljivke
starost = 30 # int
pi = 3.14 # float

# nizi znakov - string
ime = "sašo"

# boolean vrednost (True/false 1/0)
resnica = True

# seznami altgr + fg
starost = [22, 12, 66, 54, 18]
imena = ["sašo", "bine", "cene"]
itm = [[60, 160],[80,100]]
#print (starost[0])
#print (starost[-1])

# zanke -for
#izračunaj ovprečno starost

sest_let = 0
n = 0
for s in starost:
    sest_let = sest_let + s
    #n = +1
    n += 1
print(sest_let / n)
print(sum(starost) / len(starost))

#Seštej številoa od 0 - 1000
#range()
print(list(range(101)))


sest = 0
for i in range(1001):
    sest += i
print(sest)

#zmnoži (*) števila od 0 - 1000
zmno = 1
for i in range(1, 1001):
    zmno *= i

print(zmno)
"""
#funkcije
#def ime_funkcije(par. par2):

def sestej(a, b):
    return a + b

sestej(8, 19)
sestej(81, 19)

s = sestej(20, 30)
print(s + 10)

# pogojni/veljitve ali if stavki

# funkcija, ki prejme parameter n
# in vrne 0, če je  n negativen
# in vre 1, če je n pozitiven

def predznak(n):
    if n < 0:
        return 0
    else:
        return 1

print(predznak(10)) # 1
print(predznak(-10)) # 0